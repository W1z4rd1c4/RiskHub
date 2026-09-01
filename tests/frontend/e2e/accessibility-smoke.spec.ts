import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { getApiBaseUrl, getDemoTokenByAccountName } from './helpers/api-auth';
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
const RESTING_VIEWPORT = { width: 1440, height: 900 } as const;
const BUSINESS_ROUTES = [
  '/',
  '/controls',
  '/risks',
  '/settings',
  '/vendors',
  '/processes',
  '/assets',
  '/threats',
  '/ict-register/data-quality',
  '/?view=ict-committee',
  '/issues',
  '/kris',
  '/departments',
  '/approvals',
  '/activity-log',
  '/governance',
  '/notifications',
  '/vendor-reports',
  '/users',
  '/risk-hub',
] as const;
const DETAIL_FAMILIES = [
  { apiPath: '/api/v1/controls?skip=0&limit=1', logicalRoute: '/controls/:id', routePrefix: '/controls' },
  { apiPath: '/api/v1/risks?skip=0&limit=1', logicalRoute: '/risks/:id', routePrefix: '/risks' },
  { apiPath: '/api/v1/kris?page=1&size=1', logicalRoute: '/kris/:id', routePrefix: '/kris' },
  { apiPath: '/api/v1/departments', logicalRoute: '/departments/:id', routePrefix: '/departments' },
  { apiPath: '/api/v1/vendors?skip=0&limit=1', logicalRoute: '/vendors/:id', routePrefix: '/vendors' },
] as const;
const ADMIN_ROUTES = ['/admin', '/admin/docs'] as const;

interface AuditRoute {
  logicalRoute: string;
  resolvedPath: string;
}

interface IdentifiedRecord {
  id?: string | number;
}

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

function firstRecord(payload: unknown): IdentifiedRecord | null {
  if (Array.isArray(payload)) return (payload[0] as IdentifiedRecord | undefined) ?? null;
  if (!payload || typeof payload !== 'object') return null;
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  return (items[0] as IdentifiedRecord | undefined) ?? null;
}

async function resolveBusinessRoutes(page: Page): Promise<AuditRoute[]> {
  const token = await getDemoTokenByAccountName(DEMO_ACCOUNTS.CRO);
  const routes = staticAuditRoutes(BUSINESS_ROUTES);

  for (const family of DETAIL_FAMILIES) {
    const response = await page.request.get(new URL(family.apiPath, getApiBaseUrl()).toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok(), `fixture lookup ${family.apiPath}`).toBe(true);
    const record = firstRecord(await response.json());
    expect(record?.id, `runtime fixture ${family.logicalRoute}`).toBeTruthy();
    routes.push({
      logicalRoute: family.logicalRoute,
      resolvedPath: `${family.routePrefix}/${String(record?.id)}`,
    });
  }

  return routes;
}

function staticAuditRoutes(routes: readonly string[]): AuditRoute[] {
  return routes.map((route) => ({ logicalRoute: route, resolvedPath: route }));
}

async function auditRoutes(
  page: Page,
  routes: AuditRoute[],
  theme: AuditTheme,
  testInfo: TestInfo
): Promise<void> {
  const project = testInfo.project.name;

  const attach: Array<{
    logicalRoute: string;
    resolvedUrl: string;
    findingCount: number;
    findings: AxeFinding[];
  }> = [];

  for (const route of routes) {
    await navigateSpa(page, route.resolvedPath, { timeout: 30000 });
    await waitForDataLoad(page, 30000);
    const actualUrl = new URL(page.url());
    const expectedUrl = new URL(route.resolvedPath, actualUrl.origin);
    expect(actualUrl.pathname, `resolved route ${route.logicalRoute}`).toBe(expectedUrl.pathname);
    for (const [key, value] of expectedUrl.searchParams) {
      expect(actualUrl.searchParams.get(key), `resolved route ${route.logicalRoute} query ${key}`).toBe(value);
    }

    // Pin explicit WCAG tags (N8). Fail on EVERY violation the tags select — do
    // NOT filter by axe impact/severity (N9).
    const analysis = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
    const findings = toFindings(analysis.violations);
    const resolvedUrl = page.url();
    attach.push({
      logicalRoute: route.logicalRoute,
      resolvedUrl,
      findingCount: findings.length,
      findings,
    });
    assertZeroAxeFindings(findings, `${project}/${theme} ${route.logicalRoute} (${resolvedUrl})`);
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
      test.setTimeout(300_000);
      await page.setViewportSize(RESTING_VIEWPORT);
      await seedTheme(page, theme);
      await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
      await auditRoutes(page, await resolveBusinessRoutes(page), theme, testInfo);
    });

    test(`admin routes have zero axe violations in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize(RESTING_VIEWPORT);
      await seedTheme(page, theme);
      await loginAsDemoUser(page, DEMO_ACCOUNTS.ADMIN);
      await auditRoutes(page, staticAuditRoutes(ADMIN_ROUTES), theme, testInfo);
    });
  }
});
