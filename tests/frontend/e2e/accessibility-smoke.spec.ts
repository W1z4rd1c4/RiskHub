import AxeBuilder from '@axe-core/playwright';
import { test, type Page, type TestInfo } from '@playwright/test';
import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';
import { navigateSpa } from './helpers/spaNavigate';
import { waitForDataLoad } from './helpers/wait';
import {
  assertZeroAxeFindings,
  WCAG_TAGS,
  toFindings,
  validateCommittedZeroAxeBaseline,
  type AxeFinding,
} from './helpers/axeBaseline';

type AuditTheme = 'riskhub' | 'light' | 'dark';

const THEMES: AuditTheme[] = ['riskhub', 'light', 'dark'];
const BUSINESS_ROUTES = ['/', '/controls', '/risks', '/settings'];
// DORA ICT-register surfaces (ADR-013 · FR-P1-5 · N7) — the register that the
// smoke previously covered NONE of. The risk-manager demo account (Petra
// Svobodová) can read every one, including the committee (ict_committee:read).
// The committee moved from the standalone /ict-register/committee route to the
// URL-addressable Dashboard tab /?view=ict-committee (issue #64); the legacy
// path now redirects there, so the scan targets the live tab, not the redirect.
const DORA_ROUTES = [
  '/vendors',
  '/processes',
  '/assets',
  '/threats',
  '/ict-register/data-quality',
  '/?view=ict-committee',
];
const ADMIN_ROUTES = ['/admin'];

async function seedTheme(page: Page, theme: AuditTheme): Promise<void> {
  await page.addInitScript(({ themeValue }) => {
    localStorage.setItem('riskhub-theme', themeValue);
    localStorage.setItem('riskhub-language', 'en');
  }, { themeValue: theme });

  await page.route('**/api/v1/preferences', async (route, request) => {
    if (request.method() !== 'GET') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ theme, language: 'en' }),
    });
  });
}

async function auditRoutes(
  page: Page,
  routes: string[],
  theme: AuditTheme,
  testInfo: TestInfo
): Promise<void> {
  const project = testInfo.project.name;

  const attach: Array<{ route: string; findingCount: number; findings: AxeFinding[] }> = [];

  for (const route of routes) {
    await navigateSpa(page, route, { timeout: 30000 });
    await waitForDataLoad(page, 30000);

    // Pin explicit WCAG tags (N8). Fail on EVERY violation the tags select — do
    // NOT filter by axe impact/severity (N9).
    const analysis = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
    const findings = toFindings(analysis.violations);
    attach.push({ route, findingCount: findings.length, findings });
    assertZeroAxeFindings(findings, `${project}/${theme} ${route}`);
  }

  await testInfo.attach(`axe-${project}-${theme}`, {
    body: JSON.stringify(attach, null, 2),
    contentType: 'application/json',
  });
}

// ADR-013 (N8): the old chromium-only guard skipped this on CI's primary `ci`
// project. Collection is restricted to `ci` in playwright.config.ts, and the
// committed JSON is immutable audit evidence for the exact route/theme matrix.
// Every scanned axe finding fails directly; there is no fingerprint or update path.
test.describe('Accessibility smoke (WCAG 2.2 AA tags, strict-zero)', () => {
  test.beforeAll(() => validateCommittedZeroAxeBaseline());
  for (const theme of THEMES) {
    test(`business + DORA register surfaces have zero axe violations in ${theme}`, async ({ page }, testInfo) => {
      await seedTheme(page, theme);
      await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);
      await auditRoutes(page, [...BUSINESS_ROUTES, ...DORA_ROUTES], theme, testInfo);
    });

    test(`admin routes have zero axe violations in ${theme}`, async ({ page }, testInfo) => {
      await seedTheme(page, theme);
      await loginAsDemoUser(page, DEMO_ACCOUNTS.ADMIN);
      await auditRoutes(page, ADMIN_ROUTES, theme, testInfo);
    });
  }
});
