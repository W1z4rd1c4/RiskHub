import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';
import { navigateSpa } from './helpers/spaNavigate';
import { waitForDataLoad } from './helpers/wait';

type AuditTheme = 'riskhub' | 'light' | 'dark';

const THEMES: AuditTheme[] = ['riskhub', 'light', 'dark'];
const BUSINESS_ROUTES = ['/', '/controls', '/risks', '/settings'];
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
  const routeFindings: Array<{
    route: string;
    violationCount: number;
    violations: Array<{
      id: string;
      impact: string | null;
      help: string;
      nodes: number;
      targets: string[][];
      failureSummaries: string[];
    }>;
  }> = [];

  for (const route of routes) {
    await navigateSpa(page, route, { timeout: 30000 });
    await waitForDataLoad(page, 30000);

    const analysis = await new AxeBuilder({ page }).analyze();
    const violations = analysis.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact ?? null,
        help: violation.help,
        nodes: violation.nodes.length,
        targets: violation.nodes.map((node) => node.target),
        failureSummaries: violation.nodes.map((node) => node.failureSummary),
      }));

    routeFindings.push({
      route,
      violationCount: violations.length,
      violations,
    });
  }

  await testInfo.attach(`axe-${theme}`, {
    body: JSON.stringify(routeFindings, null, 2),
    contentType: 'application/json',
  });

  expect(routeFindings.filter((entry) => entry.violationCount > 0)).toEqual([]);
}

test.describe('Accessibility smoke', () => {
  for (const theme of THEMES) {
    test(`business routes are free of serious/critical axe issues in ${theme}`, async ({ page }, testInfo) => {
      if (testInfo.project.name !== 'chromium') {
        test.skip(true, 'accessibility smoke runs on chromium only');
      }

      await seedTheme(page, theme);
      await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);
      await auditRoutes(page, BUSINESS_ROUTES, theme, testInfo);
    });

    test(`admin routes are free of serious/critical axe issues in ${theme}`, async ({ page }, testInfo) => {
      if (testInfo.project.name !== 'chromium') {
        test.skip(true, 'accessibility smoke runs on chromium only');
      }

      await seedTheme(page, theme);
      await loginAsDemoUser(page, DEMO_ACCOUNTS.ADMIN);
      await auditRoutes(page, ADMIN_ROUTES, theme, testInfo);
    });
  }
});
