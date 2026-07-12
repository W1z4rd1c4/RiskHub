import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';
import { navigateSpa } from './helpers/spaNavigate';
import { waitForDataLoad } from './helpers/wait';
import {
  WCAG_TAGS,
  diffCell,
  isUpdateMode,
  loadBaselineCell,
  toFindings,
  updateBaselineCell,
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
  const update = isUpdateMode(testInfo);

  const attach: Array<{ route: string; findingCount: number; findings: AxeFinding[] }> = [];
  const drift: string[] = [];

  for (const route of routes) {
    await navigateSpa(page, route, { timeout: 30000 });
    await waitForDataLoad(page, 30000);

    // Pin explicit WCAG tags (N8). Fail on EVERY violation the tags select — do
    // NOT filter by axe impact/severity (N9).
    const analysis = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
    const findings = toFindings(analysis.violations);
    attach.push({ route, findingCount: findings.length, findings });

    if (update) {
      updateBaselineCell(project, theme, route, findings);
      continue;
    }

    const { newFindings, staleFingerprints } = diffCell(route, loadBaselineCell(project, theme, route), findings);
    for (const finding of newFindings) {
      drift.push(`NEW    ${route}  [${finding.rule}]  impact=${finding.impact ?? 'n/a'}  ${finding.selector}`);
    }
    for (const fingerprint of staleFingerprints) {
      drift.push(`STALE  ${route}  ${fingerprint}`);
    }
  }

  await testInfo.attach(`axe-${project}-${theme}`, {
    body: JSON.stringify(attach, null, 2),
    contentType: 'application/json',
  });

  if (update) {
    testInfo.annotations.push({
      type: 'a11y-axe-baseline',
      description: `captured ${project}/${theme} across ${routes.length} route(s)`,
    });
    return;
  }

  expect(
    drift,
    `axe WCAG baseline drift (${project}/${theme}). NEW violations must be fixed; STALE entries ` +
      `must be shrunk out via UPDATE_A11Y_AXE_BASELINE=1:\n${drift.join('\n')}`
  ).toEqual([]);
}

// ADR-013 (N8): the old chromium-only guard skipped this on CI's primary `ci`
// project (e2e.yml runs `playwright test --project=ci`). It is replaced by a
// `ci`-ONLY restriction, applied at collection time via per-project `testIgnore`
// in playwright.config.ts: the rule/selector baseline (accessibility-axe-baseline.json)
// is captured and enforced PER PROJECT, and only `ci` — the project CI actually
// runs — has a committed cell, so this suite is assigned to the `ci` project
// alone (absent from chromium/firefox/webkit) rather than reported red against an
// empty baseline. Existing violations are held in the shrink-only baseline; only
// NEW violations fail. See helpers/axeBaseline.ts for the one-time capture command.
test.describe('Accessibility smoke (WCAG 2.2 AA tags, baseline mode)', () => {
  for (const theme of THEMES) {
    test(`business + DORA register surfaces have no new axe violations in ${theme}`, async ({ page }, testInfo) => {
      await seedTheme(page, theme);
      await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);
      await auditRoutes(page, [...BUSINESS_ROUTES, ...DORA_ROUTES], theme, testInfo);
    });

    test(`admin routes have no new axe violations in ${theme}`, async ({ page }, testInfo) => {
      await seedTheme(page, theme);
      await loginAsDemoUser(page, DEMO_ACCOUNTS.ADMIN);
      await auditRoutes(page, ADMIN_ROUTES, theme, testInfo);
    });
  }
});
