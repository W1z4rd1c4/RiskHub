import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { getApiBaseUrl, getControlByName, getDemoTokenByAccountName, getVendorByRegistration } from './helpers/api-auth';
import { DEMO_ACCOUNTS, loginAsDemoUser, logout } from './helpers/login';
import { E2E_CONTROLS, E2E_VENDORS } from './fixtures/e2e-data';
import { renderedContrast } from './helpers/renderedContrast';
import { waitForDataLoad } from './helpers/wait';

type AuditTheme = 'riskhub' | 'light' | 'dark';

const THEMES: AuditTheme[] = ['riskhub', 'light', 'dark'];
const VIEWPORTS = [
  { width: 1024, height: 900 },
  { width: 1440, height: 900 },
] as const;

const STATIC_AUDIT_ROUTES = [
  '/issues',
  '/kris',
  '/departments',
  '/approvals',
  '/activity-log',
  '/vendor-reports',
  '/governance',
] as const;
const ADMIN_AUDIT_ROUTE = '/users';

const DETAIL_FAMILIES = [
  { apiPath: '/api/v1/controls?skip=0&limit=1', routePrefix: '/controls' },
  { apiPath: '/api/v1/risks?skip=0&limit=1', routePrefix: '/risks' },
  { apiPath: '/api/v1/issues?skip=0&limit=1', routePrefix: '/issues' },
  { apiPath: '/api/v1/kris?page=1&size=1', routePrefix: '/kris' },
  { apiPath: '/api/v1/departments', routePrefix: '/departments' },
  { apiPath: '/api/v1/vendors?skip=0&limit=1', routePrefix: '/vendors' },
  { apiPath: '/api/v1/processes?skip=0&limit=1', routePrefix: '/processes' },
  { apiPath: '/api/v1/assets?skip=0&limit=1', routePrefix: '/assets' },
  { apiPath: '/api/v1/threats?skip=0&limit=1', routePrefix: '/threats' },
] as const;

interface IdentifiedRecord {
  id?: string | number;
}

async function resolveThemeColor(
  page: Page,
  property: 'backgroundColor' | 'color',
  value: string,
): Promise<string> {
  return page.evaluate(({ propertyName, propertyValue }) => {
    const probe = document.createElement('span');
    probe.style[propertyName] = propertyValue;
    document.body.append(probe);
    const color = getComputedStyle(probe)[propertyName];
    probe.remove();
    return color;
  }, { propertyName: property, propertyValue: value });
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
  if (Array.isArray(payload)) {
    return (payload[0] as IdentifiedRecord | undefined) ?? null;
  }
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return null;
  }
  return (items[0] as IdentifiedRecord | undefined) ?? null;
}

async function resolveAuditRoutes(page: Page): Promise<string[]> {
  const token = await getDemoTokenByAccountName(DEMO_ACCOUNTS.CRO);
  const routes = [...STATIC_AUDIT_ROUTES];

  for (const family of DETAIL_FAMILIES) {
    const response = await page.request.get(new URL(family.apiPath, getApiBaseUrl()).toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok(), `fixture lookup ${family.apiPath}`).toBe(true);
    const record = firstRecord(await response.json());
    expect(record?.id, `runtime fixture ${family.routePrefix}`).toBeTruthy();
    routes.push(`${family.routePrefix}/${String(record?.id)}`);
  }

  return routes;
}

async function visit(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await page.waitForLoadState('networkidle');
  await waitForDataLoad(page, 30000);
  const main = page.locator('main');
  await expect(main).toBeVisible();
  await main.evaluate(async (element) => {
    const finiteAnimations = element.getAnimations({ subtree: true }).filter((animation) => (
      animation.effect?.getComputedTiming().iterations !== Infinity
    ));
    await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => undefined)));
  });
}

async function expectReadableTypography(locator: Locator, label: string): Promise<void> {
  await expect(locator, label).toBeVisible();
  const fontSize = await locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize, `${label} font-size`).toBeGreaterThanOrEqual(12);
}

async function settledComputedColors(locator: Locator, label: string): Promise<{ background: string; foreground: string }> {
  let previous = '';
  let stableSamples = 0;
  await expect.poll(async () => {
    const current = await locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return JSON.stringify({ background: style.backgroundColor, foreground: style.color });
    });
    stableSamples = current === previous ? stableSamples + 1 : 0;
    previous = current;
    return stableSamples;
  }, { intervals: [100, 100, 100, 100], message: `${label} computed hover colors settle`, timeout: 3_000 })
    .toBeGreaterThanOrEqual(2);
  return JSON.parse(previous) as { background: string; foreground: string };
}

async function expectCanonicalNeutralHover(page: Page, locator: Locator, label: string): Promise<void> {
  await expect(locator, label).toBeVisible();
  await page.mouse.move(0, 0);
  await expect.poll(() => locator.evaluate((element) => element.matches(':hover')), { message: `${label} leaves hover` }).toBe(false);
  await settledComputedColors(locator, `${label} normal`);
  expect(await renderedContrast(locator), `${label} normal contrast`).toBeGreaterThanOrEqual(4.5);
  const semanticBackground = await resolveThemeColor(page, 'backgroundColor', 'hsl(var(--secondary))');
  const semanticChannels = semanticBackground.match(/[\d.]+/g)?.map(Number) ?? [];
  await locator.hover();
  await expect.poll(() => locator.evaluate((element) => element.matches(':hover')), { message: `${label} enters hover` }).toBe(true);
  const hoverColors = await settledComputedColors(locator, label);
  expect(await renderedContrast(locator), `${label} hover contrast`).toBeGreaterThanOrEqual(4.5);
  const hoverChannels = hoverColors.background.match(/[\d.]+/g)?.map(Number) ?? [];
  semanticChannels.slice(0, 3).forEach((channel, index) => {
    expect(Math.abs((hoverChannels[index] ?? Number.POSITIVE_INFINITY) - channel), `${label} semantic hover background channel ${index}`)
      .toBeLessThanOrEqual(1);
  });
  expect(hoverColors.foreground, `${label} semantic hover foreground`)
    .toBe(await resolveThemeColor(page, 'color', 'hsl(var(--secondary-foreground))'));
}

async function expectCanonicalActiveViewHover(page: Page, locator: Locator, label: string): Promise<void> {
  await expect(locator, label).toBeVisible();
  await expect(locator, `${label} active state`).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0);
  await locator.hover();
  const hoverColors = await settledComputedColors(locator, label);
  expect(await renderedContrast(locator), `${label} settled hover contrast`).toBeGreaterThanOrEqual(4.5);
  expect(hoverColors.background, `${label} settled hover background`)
    .toBe(await resolveThemeColor(page, 'backgroundColor', 'hsl(var(--accent))'));
  expect(hoverColors.foreground, `${label} settled hover foreground`)
    .toBe(await resolveThemeColor(page, 'color', 'hsl(var(--accent-foreground))'));
}

async function expectSemanticFocusRing(
  page: Page,
  locator: Locator,
  label: string,
): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let tabIndex = 0; tabIndex < 100; tabIndex += 1) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate((element) => document.activeElement === element)) {
      break;
    }
  }
  await expect(locator, label).toBeFocused();
  expect(await locator.evaluate((element) => element.matches(':focus-visible')), `${label} keyboard focus-visible`).toBe(true);
  const ringColor = await resolveThemeColor(page, 'color', 'hsl(var(--ring))');
  await expect.poll(
    () => locator.evaluate((element) => getComputedStyle(element).boxShadow),
    { message: `${label} reaches its computed semantic focus indicator` },
  ).toContain(ringColor);
}

async function expectCitedMutedForegrounds(
  page: Page,
  routes: string[],
  theme: 'riskhub' | 'dark',
): Promise<void> {
  const mutedForeground = await resolveThemeColor(page, 'color', 'hsl(var(--muted-foreground))');

  await visit(page, '/departments');
  const departmentCard = page.locator('main button.glass-card').first();
  for (const label of ['Risk Register', 'Control Catalog', 'KRIs']) {
    const metadata = departmentCard.getByText(label, { exact: true });
    await expect(metadata, `${theme} Department ${label} metadata`).toBeVisible();
    expect(await metadata.evaluate((element) => getComputedStyle(element).color))
      .toBe(mutedForeground);
  }

  const kriRoute = routes.find((route) => route.startsWith('/kris/'));
  if (!kriRoute) {
    throw new Error(`No KRI detail route was available for the ${theme} muted-foreground check`);
  }
  await visit(page, kriRoute);
  const metadataCard = page.locator('main .glass-card').filter({
    has: page.getByRole('heading', { name: 'Metadata' }),
  });
  for (const label of ['Unit of Measure', 'Last Updated', 'Status']) {
    const metadata = metadataCard.getByText(label, { exact: true });
    await expect(metadata, `${theme} KRI ${label} metadata`).toBeVisible();
    expect(await metadata.evaluate((element) => getComputedStyle(element).color))
      .toBe(mutedForeground);
  }

  await page.route('**/api/v1/kris/overdue*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/v1/kris/due-soon*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        kri_id: theme === 'riskhub' ? 9921 : 9922,
        metric_name: `UX-24 ${theme} KRI`,
        frequency: 'quarterly',
        period_end: '2026-08-31',
        due_date: '2026-09-03',
        days_until_due: 3,
        risk_id: 1,
      }]),
    });
  });
  await visit(page, '/');
  const statusWidget = page.getByRole('region', { name: 'KRI Status' });
  for (const metadata of [
    statusWidget.getByText('quarterly', { exact: true }),
    statusWidget.getByRole('button', { name: 'View All' }),
  ]) {
    await expect(metadata, `${theme} KRI status metadata`).toBeVisible();
    expect(await metadata.evaluate((element) => getComputedStyle(element).color))
      .toBe(mutedForeground);
  }
}

test.describe('UX-24 audited theme matrix', () => {
  for (const theme of THEMES) {
    test(`keeps migrated Button hover pairs readable and semantic in ${theme}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width: 1440, height: 900 });
      await seedTheme(page, theme);
      await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);
      const routes = await resolveAuditRoutes(page);
      const assetRoute = routes.find((route) => route.startsWith('/assets/'));
      const riskRoute = routes.find((route) => route.startsWith('/risks/'));
      expect(assetRoute).toBeTruthy();
      expect(riskRoute).toBeTruthy();

      await visit(page, assetRoute!);
      await page.getByTestId('asset-detail-archive').click();
      await expectCanonicalNeutralHover(
        page,
        page.getByRole('alertdialog').getByRole('button', { name: /cancel/i }),
        `${theme} Confirm cancel`,
      );

      await visit(page, riskRoute!);
      await page.getByRole('button', { name: /link existing/i }).first().click();
      const linkDialog = page.getByTestId('link-management-dialog');
      await expectCanonicalNeutralHover(
        page,
        linkDialog.getByRole('button', { name: /close/i }).last(),
        `${theme} Link Management footer`,
      );

      await visit(page, '/risks');
      await expectCanonicalActiveViewHover(page, page.getByTestId('risks-view-all'), `${theme} active register view`);
      await page.getByTestId('risks-lifecycle-filter-trigger').click();
      await page.getByTestId('risks-lifecycle-filter-option-archived').click();
      await expectCanonicalNeutralHover(page, page.getByTestId('risks-export-button'), `${theme} register export`);
      const chip = page.locator('[data-testid^="risks-filter-chip-"]').first();
      await expectCanonicalNeutralHover(page, chip.getByRole('button'), `${theme} toolbar chip remove`);
      await expectCanonicalNeutralHover(page, page.getByTestId('risks-clear-filters'), `${theme} toolbar Clear all`);

      const activeVendor = await getVendorByRegistration(E2E_VENDORS.ACTIVE_PRIMARY.registration_id);
      const archivedVendor = await getVendorByRegistration(E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id);
      expect(activeVendor?.id).toBeTruthy();
      expect(archivedVendor?.id).toBeTruthy();
      await visit(page, `/vendors/${activeVendor!.id}`);
      const archive = page.getByRole('button', { name: /^archive$/i });
      await expect(archive, `${theme} Vendor archive`).toBeVisible();
      expect(await renderedContrast(archive), `${theme} Vendor archive normal contrast`).toBeGreaterThanOrEqual(4.5);
      await archive.hover();
      await settledComputedColors(archive, `${theme} Vendor archive`);
      expect(await renderedContrast(archive), `${theme} Vendor archive hover contrast`).toBeGreaterThanOrEqual(4.5);
      await visit(page, `/vendors/${archivedVendor!.id}`);
      await expectCanonicalNeutralHover(
        page,
        page.getByRole('button', { name: /unarchive/i }),
        `${theme} Vendor restore`,
      );

      await logout(page);
      await loginAsDemoUser(page, DEMO_ACCOUNTS.ADMIN);
      await visit(page, '/admin');
      await page.getByRole('tab', { name: /active sessions/i }).click();
      await expectCanonicalNeutralHover(
        page,
        page.getByRole('button', { name: /check ad|zkontrolovat ad/i }),
        `${theme} Sessions directory check`,
      );
    });
  }

  for (const theme of THEMES) {
    for (const viewport of VIEWPORTS) {
      test(`has zero rendered contrast violations in ${theme} at ${viewport.width}px`, async ({ page }, testInfo: TestInfo) => {
        test.setTimeout(8 * 60 * 1000);
        await page.setViewportSize(viewport);
        await seedTheme(page, theme);
        await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
        const routes = await resolveAuditRoutes(page);
        const findings: Array<{ route: string; violations: unknown[] }> = [];

        for (const route of routes) {
          await visit(page, route);
          // This is an additive contrast-only matrix. The existing strict Axe
          // suites continue to run every pinned WCAG rule without exclusions.
          const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
          if (result.violations.length > 0) {
            findings.push({ route, violations: result.violations });
          }
        }

        await logout(page);
        await loginAsDemoUser(page, DEMO_ACCOUNTS.ADMIN);
        await visit(page, ADMIN_AUDIT_ROUTE);
        const adminResult = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
        if (adminResult.violations.length > 0) {
          findings.push({ route: ADMIN_AUDIT_ROUTE, violations: adminResult.violations });
        }

        await testInfo.attach(`theme-contrast-${theme}-${viewport.width}`, {
          body: JSON.stringify(findings, null, 2),
          contentType: 'application/json',
        });
        expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
      });
    }
  }

  test('drives rendered glass surfaces from the active theme tokens', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
    await visit(page, '/settings');
    await page.getByTestId('settings-tab-appearance').click();
    await page.getByTestId('theme-dark').click();
    await expect(page.locator('html')).toHaveClass(/theme-dark/);
    await page.getByTestId('settings-tab-profile').click();

    const surface = page.locator('main .glass-card').first();
    const glassColor = await resolveThemeColor(page, 'backgroundColor', 'hsl(var(--glass))');
    expect(await surface.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(glassColor);

    const activeSettingsTab = page.getByTestId('settings-tab-profile');
    const accentForeground = await resolveThemeColor(page, 'color', 'hsl(var(--accent-foreground))');
    await expect.poll(
      () => activeSettingsTab.evaluate((element) => getComputedStyle(element).color),
      { message: 'active Settings tab uses the settled accent foreground' },
    ).toBe(accentForeground);

    const routes = await resolveAuditRoutes(page);
    const vendorRoute = routes.find((route) => route.startsWith('/vendors/'));
    if (!vendorRoute) {
      throw new Error('No vendor detail route was available for the theme-token check');
    }
    await visit(page, vendorRoute);
    const vendorStaticCard = page.locator('main .vendor-route .glass-card:not(.interactive-card)').first();
    await expect(vendorStaticCard).toBeVisible();
    const vendorBefore = await vendorStaticCard.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, transitionProperty: style.transitionProperty };
    });
    const vendorGlassColor = await resolveThemeColor(page, 'backgroundColor', 'hsl(var(--glass))');
    expect(vendorBefore.backgroundColor).toBe(vendorGlassColor);
    expect(vendorBefore.transitionProperty).toBe('none');
    await vendorStaticCard.hover();
    expect(await vendorStaticCard.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe(vendorBefore.backgroundColor);

    await expectCitedMutedForegrounds(page, routes, 'dark');
    await visit(page, '/settings');
    await page.getByTestId('settings-tab-appearance').click();
    await page.getByTestId('theme-riskhub').click();
    await expect(page.locator('html')).toHaveClass(/theme-riskhub/);
    await expectCitedMutedForegrounds(page, routes, 'riskhub');
  });

  test('renders every risk-score matrix band with its semantic computed color', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedTheme(page, 'riskhub');
    await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
    const routes = await resolveAuditRoutes(page);
    const riskRoute = routes.find((route) => route.startsWith('/risks/'));
    if (!riskRoute) {
      throw new Error('No risk detail route was available for the semantic color check');
    }
    await visit(page, riskRoute);

    const grossRiskMatrix = page.getByRole('group', { name: 'Gross Risk' });
    const semanticBands = [
      { selector: '.bg-success\\/40', token: '--success' },
      { selector: '.bg-info\\/40', token: '--info' },
      { selector: '.bg-warning\\/40', token: '--warning' },
      { selector: '.bg-destructive\\/40', token: '--destructive' },
    ] as const;

    for (const band of semanticBands) {
      const cell = grossRiskMatrix.locator(band.selector).first();
      await expect(cell).toBeVisible();
      const semanticColor = await resolveThemeColor(
        page,
        'backgroundColor',
        `hsl(var(${band.token}) / 0.4)`,
      );
      expect(await cell.evaluate((element) => getComputedStyle(element).backgroundColor))
        .toBe(semanticColor);
    }
  });

  test('keeps audited state typography readable and card motion semantics honest', async ({ page }) => {
    test.setTimeout(8 * 60 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedTheme(page, 'light');
    await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
    const routes = await resolveAuditRoutes(page);

    const sidebarGroupLabels = page.locator('aside [id^="sidebar-group-"] > button > span');
    for (let index = 0; index < await sidebarGroupLabels.count(); index += 1) {
      await expectReadableTypography(sidebarGroupLabels.nth(index), `sidebar group ${index + 1}`);
    }

    await visit(page, '/departments');
    const departmentHeading = page.locator('main button').getByRole('heading').first();
    await expectReadableTypography(departmentHeading, 'department card heading');
    const lightForeground = await resolveThemeColor(page, 'color', 'hsl(var(--foreground))');
    const lightMutedForeground = await resolveThemeColor(page, 'color', 'hsl(var(--muted-foreground))');
    const lightAccentText = await resolveThemeColor(page, 'color', 'hsl(var(--accent-text))');
    const lightSecondaryForeground = await resolveThemeColor(page, 'color', 'hsl(var(--secondary-foreground))');
    const lightSecondaryHover = await resolveThemeColor(page, 'backgroundColor', 'hsl(var(--secondary) / 0.8)');
    const lightWarning = await resolveThemeColor(page, 'backgroundColor', 'hsl(var(--warning))');
    const lightWarningText = await resolveThemeColor(page, 'color', 'hsl(var(--warning-text))');
    const lightWarningForeground = await resolveThemeColor(page, 'color', 'hsl(var(--warning-foreground))');
    expect(await departmentHeading.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightForeground);

    const kriRoute = routes.find((route) => route.startsWith('/kris/'));
    if (!kriRoute) {
      throw new Error('No KRI detail route was available for the typography state check');
    }
    await visit(page, kriRoute);
    const currentValueCard = page.locator('main .glass-card').filter({ hasText: 'Current Value' }).first();
    const currentValueHeading = currentValueCard.getByRole('heading', { name: 'Current Value' });
    await expectReadableTypography(currentValueHeading, 'KRI current-value heading');
    expect(await currentValueHeading.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightForeground);
    for (const limitValue of await currentValueCard.locator('strong').all()) {
      await expectReadableTypography(limitValue, 'KRI limit value');
      expect(await limitValue.evaluate((element) => getComputedStyle(element).color))
        .toBe(lightForeground);
    }

    await page.route('**/api/v1/kris/overdue*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/api/v1/kris/due-soon*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          kri_id: 9901,
          metric_name: 'UX-24 Due Soon KRI',
          frequency: 'quarterly',
          period_end: '2026-08-31',
          due_date: '2026-09-03',
          days_until_due: 3,
          risk_id: 1,
        }]),
      });
    });
    await visit(page, '/');
    const dueSoonCard = page.locator('main').filter({ hasText: 'UX-24 Due Soon KRI' });
    const kriStatusWidget = page.getByRole('region', { name: 'KRI Status' });
    const kriStatusHeading = kriStatusWidget.getByRole('heading', { name: 'KRI Status' });
    const dueSoonHeading = kriStatusWidget.getByRole('heading', { name: 'UX-24 Due Soon KRI' });
    expect(await kriStatusHeading.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightForeground);
    expect(await dueSoonHeading.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightForeground);
    const dueStateLabel = dueSoonCard.getByText(/3 days/i).first();
    await expectReadableTypography(dueStateLabel, 'KRI due-state label');
    expect(await dueStateLabel.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightWarningText);
    await expectReadableTypography(dueSoonCard.getByText('quarterly', { exact: true }), 'KRI frequency label');
    await expectReadableTypography(dueSoonCard.getByRole('button', { name: /View All/i }), 'KRI view-all action');
    const upcomingTab = kriStatusWidget.getByRole('button', { name: 'Upcoming', exact: true });
    const overdueTab = kriStatusWidget.getByRole('button', { name: 'Overdue', exact: true });
    expect(await overdueTab.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightMutedForeground);
    await overdueTab.hover();
    await expect.poll(
      () => overdueTab.evaluate((element) => getComputedStyle(element).color),
      { message: 'inactive KRI status tab reaches the readable hover foreground' },
    ).toBe(lightForeground);
    await overdueTab.click();
    await expect.poll(
      () => overdueTab.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'selected overdue tab reaches its semantic warning fill' },
    ).toBe(lightWarning);
    await expect.poll(
      () => overdueTab.evaluate((element) => getComputedStyle(element).color),
      { message: 'selected overdue tab reaches its paired foreground' },
    ).toBe(lightWarningForeground);
    await upcomingTab.click();
    const dashboardStatCard = page.getByRole('button', { name: /Total Controls/i });
    expect(await dashboardStatCard.evaluate((element) => element.tagName)).toBe('BUTTON');
    const dashboardStatValue = dashboardStatCard.getByRole('heading', { level: 3 });
    expect(await dashboardStatValue.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightForeground);
    await expectReadableTypography(dashboardStatCard.getByText('Live', { exact: true }), 'Dashboard status label');
    const controlAnalyticsHeading = page.getByRole('heading', { name: 'Control Analytics' });
    expect(await controlAnalyticsHeading.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightForeground);
    await page.mouse.move(0, 0);
    const lightGlass = await resolveThemeColor(page, 'backgroundColor', 'hsl(var(--glass))');
    await expect.poll(
      () => dashboardStatCard.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'Dashboard action card returns to its resting surface' },
    ).toBe(lightGlass);
    const dashboardCardBefore = await dashboardStatCard.evaluate((element) => ({
      backgroundColor: getComputedStyle(element).backgroundColor,
      transitionProperty: getComputedStyle(element).transitionProperty,
    }));
    expect(dashboardCardBefore.transitionProperty).not.toContain('all');
    await expectSemanticFocusRing(page, dashboardStatCard, 'Dashboard summary action card');
    await dashboardStatCard.hover();
    await expect.poll(
      () => dashboardStatCard.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'Dashboard action card reaches its named hover surface' },
    ).not.toBe(dashboardCardBefore.backgroundColor);
    await dashboardStatCard.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/controls$/);

    const riskRoute = routes.find((route) => route.startsWith('/risks/'));
    if (!riskRoute) {
      throw new Error('No risk detail route was available for the link-confirmation check');
    }
    const riskId = Number(riskRoute.split('/').pop());
    await page.route(new RegExp(`/api/v1/risks/${riskId}(?:\\?.*)?$`), async (route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const risk = await response.json() as Record<string, unknown>;
      risk.category = 'UX-24 Category';
      risk.process = 'UX-24 Process';
      risk.subprocess = 'UX-24 Subprocess';
      risk.is_priority = false;
      risk.owner = { id: 9907, name: 'UX-24 Risk Owner', email: 'ux24.owner@example.test' };
      risk.department = { id: 9908, name: 'UX-24 Risk Department', code: 'UX24' };
      await route.fulfill({ response, json: risk });
    });
    await page.route('**/api/v1/risks/*/controls', async (route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 9903,
          control_id: 9903,
          risk_id: riskId,
          effectiveness: 'high',
          notes: 'Deterministic ControlGaugeCard fixture.',
          created_at: '2026-08-28T00:00:00Z',
          control: {
            id: 9903,
            name: 'UX-24 Control Gauge',
            frequency: 'quarterly',
            risk_level: 4,
            status: 'active',
            is_archived: false,
            monitoring_status: 'passed',
          },
        }]),
      });
    });
    await page.route('**/api/v1/controls?*', async (route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      const capabilities = {
        can_read: true,
        can_update: false,
        can_update_sensitive_fields: false,
        can_request_update_approval: false,
        can_archive_immediately: false,
        can_request_archive_approval: false,
        can_restore: true,
        can_log_execution: false,
        can_view_executions: true,
        can_link_risk: false,
        can_unlink_risk: false,
        can_view_linked_risks: true,
        can_view_linked_vendors: true,
        can_create_issue: false,
        has_pending_delete_approval: false,
        has_pending_update_approval: false,
        requires_privileged_update_approval: false,
        requires_privileged_delete_approval: false,
        is_archived: true,
        is_executable: false,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{
            id: 9906,
            name: 'UX-24 Link Search Control',
            description: 'Deterministic Link Management typography fixture.',
            frequency: 'quarterly',
            risk_level: 3,
            status: 'inactive',
            is_archived: true,
            control_form: 'manual',
            control_owner_name: 'UX-24 Control Owner',
            capabilities,
          }],
          total: 1,
          offset: 0,
          limit: 20,
        }),
      });
    });
    await visit(page, riskRoute);
    const riskBackButton = page.getByRole('button', { name: 'Back to Register' });
    await riskBackButton.hover();
    await expect.poll(
      () => riskBackButton.evaluate((element) => getComputedStyle(element).color),
      { message: 'Risk detail Back action reaches the readable hover foreground' },
    ).toBe(lightSecondaryForeground);
    await expect.poll(
      () => riskBackButton.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'Risk detail Back action reaches the secondary hover surface' },
    ).toBe(lightSecondaryHover);
    const classificationCard = page.locator('main .glass-card').filter({
      has: page.getByRole('heading', { name: 'Classification' }),
    });
    const ownershipCard = page.locator('main .glass-card').filter({
      has: page.getByRole('heading', { name: 'Ownership' }),
    });
    const connectionsCard = page.locator('main .glass-card').filter({
      has: page.getByRole('heading', { name: 'Connections' }),
    });
    for (const heading of [
      classificationCard.getByRole('heading', { name: 'Classification' }),
      ownershipCard.getByRole('heading', { name: 'Ownership' }),
      connectionsCard.getByRole('heading', { name: 'Connections' }),
      page.getByRole('heading', { name: 'Risk Appetite Indicators' }),
    ]) {
      expect(await heading.evaluate((element) => getComputedStyle(element).color))
        .toBe(lightForeground);
    }
    for (const value of [
      classificationCard.getByText('UX-24 Category', { exact: true }),
      classificationCard.getByText('UX-24 Process', { exact: true }),
      ownershipCard.getByText('UX-24 Risk Owner', { exact: true }),
      ownershipCard.getByText('UX-24 Risk Department', { exact: true }),
    ]) {
      expect(await value.evaluate((element) => getComputedStyle(element).color))
        .toBe(lightForeground);
    }
    for (const value of [
      classificationCard.getByText('UX-24 Subprocess', { exact: true }),
      classificationCard.getByText('No', { exact: true }),
      ownershipCard.getByText('ux24.owner@example.test', { exact: true }),
      ownershipCard.getByText('UX24', { exact: true }),
    ]) {
      expect(await value.evaluate((element) => getComputedStyle(element).color))
        .toBe(lightMutedForeground);
    }
    for (const connectionLabel of ['Mitigating Controls', 'Risk Appetite Indicators', 'Linked Vendors']) {
      const connectionValue = connectionsCard.getByText(connectionLabel, { exact: true }).locator('..').locator('span').last();
      expect(await connectionValue.evaluate((element) => getComputedStyle(element).color))
        .toBe(lightForeground);
    }
    const controlGaugeCard = page.getByRole('button', { name: /UX-24 Control Gauge/i });
    await expect(controlGaugeCard).toBeVisible();
    expect(await controlGaugeCard.evaluate((element) => element.tagName)).toBe('BUTTON');
    const controlGaugeTitle = controlGaugeCard.getByRole('heading', { name: 'UX-24 Control Gauge' });
    expect(await controlGaugeTitle.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightForeground);
    const controlGaugeMetadata = [
      controlGaugeCard.getByText('Control', { exact: true }),
      controlGaugeCard.getByText(/Frequency: quarterly/i),
      controlGaugeCard.getByText(/Effectiveness: high/i),
    ];
    for (const metadata of controlGaugeMetadata) {
      await expectReadableTypography(metadata, 'Control gauge metadata');
      expect(await metadata.evaluate((element) => getComputedStyle(element).color))
        .toBe(lightMutedForeground);
    }
    const controlGaugeValue = controlGaugeCard.locator('div').filter({ hasText: /^4\s*\/\s*5$/ }).last();
    await expectReadableTypography(controlGaugeValue, 'Control gauge value');
    expect(await controlGaugeValue.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightForeground);
    const successGaugeZone = await resolveThemeColor(page, 'color', 'hsl(var(--success) / 0.2)');
    expect(await controlGaugeCard.locator('svg rect').nth(1)
      .evaluate((element) => getComputedStyle(element).color)).toBe(successGaugeZone);
    await expectSemanticFocusRing(page, controlGaugeCard, 'Control gauge card');
    const addKriButton = page.getByRole('button', { name: /Add KRI/i });
    expect(await addKriButton.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightAccentText);
    await page.getByRole('button', { name: /Link Existing/i }).first().click();
    const linkDialog = page.getByTestId('link-management-dialog');
    await expect(linkDialog).toBeVisible();
    await expectReadableTypography(
      linkDialog.getByRole('heading', { name: 'Create Link Control' }),
      'Link Search panel heading',
    );
    await expectReadableTypography(linkDialog.getByText('Filter', { exact: true }), 'Link Search filter heading');
    await expectReadableTypography(
      linkDialog.getByText('Initial suggestions', { exact: true }),
      'Link Search results heading',
    );
    await expectReadableTypography(linkDialog.getByText('1 item', { exact: true }), 'Link Search result count');
    const suggestions = linkDialog.getByText('Initial Suggestions').locator('..').locator('..');
    const linkSearchResult = suggestions.getByRole('button', { name: /UX-24 Link Search Control/i });
    await expectReadableTypography(linkSearchResult.getByText('Archived', { exact: true }), 'Link result Archived badge');
    await expectReadableTypography(
      linkSearchResult.getByText('UX-24 Control Owner', { exact: true }),
      'Link result business metadata',
    );
    await expectReadableTypography(linkSearchResult.getByText('Level', { exact: true }), 'Link result Level label');
    await expectReadableTypography(linkSearchResult.getByText('3/5', { exact: true }), 'Link result Level value');
    await expectReadableTypography(linkSearchResult.getByText('Freq', { exact: true }), 'Link result Freq label');
    await expectReadableTypography(linkSearchResult.getByText('quarterly', { exact: true }), 'Link result Freq value');
    await expectReadableTypography(suggestions.getByRole('button', { name: /Unarchive/i }), 'Link result action');
    const linkSearchStateAxe = await new AxeBuilder({ page })
      .include('[data-testid="link-management-dialog"]')
      .withRules(['color-contrast'])
      .analyze();
    expect(
      linkSearchStateAxe.violations,
      JSON.stringify(linkSearchStateAxe.violations, null, 2),
    ).toEqual([]);
    const includeArchivedCheckbox = linkDialog.getByRole('checkbox', { name: 'Include archived' });
    await expectReadableTypography(
      linkDialog.getByText('Include archived', { exact: true }),
      'Link Search archived filter',
    );
    await includeArchivedCheckbox.check();
    await expectReadableTypography(linkDialog.getByRole('button', { name: 'Clear' }), 'Link Search clear action');
    await expect(linkSearchResult).toBeVisible();
    await suggestions.getByRole('button').first().click();
    await expectReadableTypography(linkDialog.getByText('Confirm Linkage'), 'link confirmation heading');
    await expectReadableTypography(linkDialog.getByText('Owner Information'), 'link owner heading');
    await expectReadableTypography(linkDialog.getByRole('button', { name: 'Change' }), 'link change action');
    await expectReadableTypography(linkDialog.getByRole('button', { name: 'Create Link' }), 'create-link action');
    await linkDialog.getByTitle('Close').click();
    const manageExistingLinksButton = page.getByRole('button', { name: /Manage Existing Links/i });
    await manageExistingLinksButton.click();
    const existingLinksDialog = page.getByTestId('link-management-dialog');
    await expect(existingLinksDialog).toBeVisible();
    await expectReadableTypography(existingLinksDialog.getByText('Details', { exact: true }), 'Existing Links heading');
    await expectReadableTypography(
      existingLinksDialog.getByText(/Deterministic ControlGaugeCard fixture/),
      'Existing Link notes',
    );
    await expectReadableTypography(
      existingLinksDialog.getByText('high', { exact: true }),
      'Existing Link effectiveness',
    );
    const existingLinksStateAxe = await new AxeBuilder({ page })
      .include('[data-testid="link-management-dialog"]')
      .withRules(['color-contrast'])
      .analyze();
    expect(
      existingLinksStateAxe.violations,
      JSON.stringify(existingLinksStateAxe.violations, null, 2),
    ).toEqual([]);
    await existingLinksDialog.getByTitle('Close').click();
    await expect(existingLinksDialog).toBeHidden();
    await expect(manageExistingLinksButton).toBeFocused();
    await expectSemanticFocusRing(page, controlGaugeCard, 'Control gauge card after dialog close');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/controls\/9903$/);

    await visit(page, '/approvals?tab=pending');
    const legacyEditCard = page.locator('main .glass-card').filter({
      hasText: 'E2E test: Sensitive field change on non-priority risk',
    });
    await expect(legacyEditCard).toBeVisible();
    await legacyEditCard.getByRole('button', { name: 'View Changes' }).click();
    const legacyChangeField = legacyEditCard
      .locator('[data-testid^="approval-legacy-changes-"] dt')
      .first();
    await expect(legacyChangeField).toBeVisible();
    await expectReadableTypography(
      legacyChangeField,
      'approval pending-change field',
    );

    const controlRoute = routes.find((route) => route.startsWith('/controls/'));
    if (!controlRoute) {
      throw new Error('No control detail route was available for the typography state check');
    }
    const controlId = Number(controlRoute.split('/').pop());
    await page.route(new RegExp(`/api/v1/controls/${controlId}(?:\\?.*)?$`), async (route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const control = await response.json() as Record<string, unknown>;
      control.capabilities = {
        ...(control.capabilities as Record<string, unknown> | undefined),
        can_create_issue: true,
        can_view_executions: true,
      };
      await route.fulfill({ response, json: control });
    });
    await page.route(`**/api/v1/controls/${controlId}/executions`, async (route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 9923,
          control_id: controlId,
          executed_by_id: 9924,
          executed_at: '2026-08-28T08:30:00Z',
          result: 'failed',
          findings: 'UX-24 execution finding',
          evidence_reference: 'UX-24-EVIDENCE',
          notes: 'UX-24 execution notes',
          next_scheduled: '2026-09-05',
          created_at: '2026-08-28T08:30:00Z',
          executed_by: { id: 9924, name: 'UX-24 Executor' },
        }]),
      });
    });
    await visit(page, controlRoute);
    const controlBackButton = page.getByRole('button', { name: 'Back to Catalog' });
    await controlBackButton.hover();
    await expect.poll(
      () => controlBackButton.evaluate((element) => getComputedStyle(element).color),
      { message: 'Control detail Back action reaches the readable hover foreground' },
    ).toBe(lightSecondaryForeground);
    await expect.poll(
      () => controlBackButton.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'Control detail Back action reaches the secondary hover surface' },
    ).toBe(lightSecondaryHover);
    await page.getByRole('tab', { name: 'Execution History' }).click();
    await expect(page.getByRole('heading', { name: 'Execution Audit Trail' })).toBeVisible();
    const logExecutionButton = page.getByRole('button', { name: 'Log Execution' });
    await expect(logExecutionButton).toBeVisible();
    await expectReadableTypography(logExecutionButton, 'control log-execution action');
    const executionDisclosure = page.getByRole('button', { name: /UX-24 Executor/i });
    await expect(executionDisclosure).toBeVisible();
    const executor = executionDisclosure.getByText('UX-24 Executor', { exact: true });
    const nextExecution = executionDisclosure.getByText(/Next:/);
    await expectReadableTypography(executor, 'Execution executor metadata');
    await expectReadableTypography(nextExecution, 'Execution next-date metadata');
    expect(await executor.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightMutedForeground);
    expect(await nextExecution.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightAccentText);
    const executionRow = executionDisclosure.locator('..');
    const executionIssueAction = executionRow.getByRole('button', { name: 'New Issue' });
    await expectReadableTypography(executionIssueAction, 'Execution New Issue action');
    expect(await executionIssueAction.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightForeground);
    await executionDisclosure.click();
    for (const readableDetail of [
      page.getByRole('heading', { name: 'Findings & Evidence' }),
      page.getByText('UX-24-EVIDENCE', { exact: true }),
      page.getByRole('heading', { name: 'Additional Notes' }),
    ]) {
      await expectReadableTypography(readableDetail, 'Execution expanded detail');
      expect(await readableDetail.evaluate((element) => getComputedStyle(element).color))
        .toBe(lightMutedForeground);
    }

    const archivedControl = await getControlByName(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name);
    expect(archivedControl?.id, 'archived control typography fixture').toBeTruthy();
    await visit(page, `/controls/${String(archivedControl?.id)}`);
    await expect(page.getByText(/Archived Risks/i)).toBeVisible();
    await expectReadableTypography(page.getByText(/Archived Risks/i), 'archived-risk label');

    await page.route('**/api/v1/dashboard/committee-summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          critical_risks: [{
            id: 901,
            risk_id_code: 'UX-24-RISK',
            name: 'UX-24 Critical Risk',
            process: 'Claims',
            description: 'Deterministic typography-state fixture.',
            net_score: 16,
            is_priority: true,
            owner_name: 'Risk Owner',
            department_name: 'Risk',
          }],
          critical_vendors: [{
            id: 902,
            name: 'UX-24 Critical Vendor',
            process: 'Claims Processing',
            subprocess: 'FNOL',
            risk_score_1_5: 4,
            supports_important_core_insurance_function: true,
            dora_relevant: true,
            is_significant_vendor: true,
            outsourcing_owner_name: 'Vendor Owner',
            department_name: 'Operations',
          }],
          department_exposure: [{
            id: 903,
            name: 'UX-24 Operations',
            total_exposure: 12,
            risk_count: 2,
          }],
          recent_activity: [{
            id: 904,
            action: 'approve',
            entity_type: 'risk',
            entity_name: 'UX-24 Activity',
            description: 'Deterministic typography-state fixture.',
            created_at: new Date().toISOString(),
          }],
        }),
      });
    });
    await visit(page, '/?view=risk-committee');
    await expect(page.getByText('UX-24 Critical Risk')).toBeVisible();
    const criticalRiskCard = page.locator('main .glass-card').filter({ hasText: 'UX-24 Critical Risk' });
    await expectReadableTypography(
      criticalRiskCard.getByText('UX-24 Critical Risk'),
      'committee critical-risk title',
    );
    const committeeMetadata = [
      page.getByText('Operations · Claims Processing / FNOL', { exact: true }),
      page.locator('main .glass-card').filter({ hasText: 'UX-24 Operations' })
        .getByText('2 risks', { exact: true }),
      page.locator('main .glass-card').filter({ hasText: 'UX-24 Activity' })
        .getByText('Today', { exact: true }),
    ];
    for (const metadata of committeeMetadata) {
      await expect(metadata).toBeVisible();
      await expectReadableTypography(metadata, 'committee metadata');
    }
    const committeeForegrounds = [
      page.getByRole('heading', { name: 'Critical Risks' }),
      criticalRiskCard.getByText('UX-24 Critical Risk'),
      page.getByRole('heading', { name: 'Critical Vendors' }),
      page.getByText('UX-24 Critical Vendor', { exact: true }),
      page.getByRole('heading', { name: 'Risk Exposure by Dept' }),
      page.getByText('UX-24 Operations', { exact: true }),
      page.getByRole('heading', { name: 'Recent Activity' }),
      page.getByText('UX-24 Activity', { exact: true }),
    ];
    for (const foreground of committeeForegrounds) {
      expect(await foreground.evaluate((element) => getComputedStyle(element).color))
        .toBe(lightForeground);
    }
    expect(await criticalRiskCard.getByText('Deterministic typography-state fixture.', { exact: true })
      .evaluate((element) => getComputedStyle(element).color)).toBe(lightMutedForeground);
    await expectReadableTypography(
      page.locator('main .glass-card').filter({ hasText: 'UX-24 Activity' }).getByText('Approve', { exact: true }),
      'committee activity action',
    );

    await logout(page);
    await loginAsDemoUser(page, DEMO_ACCOUNTS.ADMIN);
    await visit(page, ADMIN_AUDIT_ROUTE);
    const addUserButton = page.getByRole('button', { name: /Add User|Add from AD/ });
    await expect(addUserButton).toBeVisible();
    const accentFill = await resolveThemeColor(page, 'backgroundColor', 'hsl(var(--accent))');
    const accentHover = await resolveThemeColor(page, 'backgroundColor', 'hsl(var(--accent-hover))');
    const accentForeground = await resolveThemeColor(page, 'color', 'hsl(var(--accent-foreground))');
    expect(await addUserButton.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe(accentFill);
    expect(await addUserButton.evaluate((element) => getComputedStyle(element).color))
      .toBe(accentForeground);
    await addUserButton.hover();
    await expect.poll(
      () => addUserButton.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'filled accent action reaches its opaque hover token' },
    ).toBe(accentHover);

    const editAccessButton = page.getByRole('button', { name: /Edit Access/i }).first();
    await editAccessButton.click();
    const accessDialog = page.getByRole('dialog', { name: /Edit Access Settings/i });
    await expect(accessDialog.getByTestId('access-edit-ready')).toBeVisible();
    const accessSaveButton = accessDialog.getByRole('button', { name: 'Save' });
    await accessSaveButton.hover();
    await expect.poll(
      () => accessSaveButton.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'Access Save reaches the opaque accent hover token' },
    ).toBe(accentHover);
    await accessDialog.getByRole('button', { name: 'Close' }).click();

    const showPermissionsButton = page.getByRole('button', { name: 'Show all permissions' }).first();
    await expect(showPermissionsButton).toBeVisible();
    await showPermissionsButton.click();
    await expect(page.getByTestId('permission-matrix-action').first()).toBeVisible();
    await expectReadableTypography(
      page.getByTestId('permission-matrix-action').first(),
      'permission action',
    );
    await expectReadableTypography(
      page.getByTestId('permission-matrix-action').first().locator('span').last(),
      'permission description',
    );

    await logout(page);
    await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
    await visit(page, '/settings');
    const staticCard = page.locator('main .glass-card').first();
    const staticBefore = await staticCard.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, transitionProperty: style.transitionProperty };
    });
    await staticCard.hover();
    const staticAfter = await staticCard.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(staticBefore.transitionProperty).toBe('none');
    expect(staticAfter).toBe(staticBefore.backgroundColor);

    await visit(page, '/departments');
    const interactiveCard = page.locator('main button.glass-card').first();
    const interactiveBefore = await interactiveCard.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, transitionProperty: style.transitionProperty };
    });
    await interactiveCard.hover();
    expect(interactiveBefore.transitionProperty).not.toContain('all');
    await expect.poll(
      () => interactiveCard.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'interactive card reaches its observable hover color' },
    ).not.toBe(interactiveBefore.backgroundColor);

    const vendorRoute = routes.find((route) => route.startsWith('/vendors/'));
    if (!vendorRoute) {
      throw new Error('No vendor detail route was available for the KRI card check');
    }
    const vendorId = Number(vendorRoute.split('/').pop());
    await page.route(`**/api/v1/vendors/${vendorId}`, async (route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const vendor = await response.json() as Record<string, unknown>;
      vendor.derived = {
        country_category: 'domestic',
        cif: 'yes',
        linked_asset_count: 1,
        linked_process_count: 1,
        cif_process_count: 1,
        h_rank: 4,
        max_criticality: 'critical',
        tier: 'critical',
        cif_chain: 'yes',
        chain_level: 'A',
        direct_sub_provider_names: [],
        direct_sub_provider_count: 0,
        significance_outcome: 'no',
        main_contract_reference: null,
        main_contract_arrangement_type: null,
        main_contract_start_date: null,
        main_contract_end_date: null,
        contract_count: 1,
        main_contract_count: 0,
        is_complete: true,
        inputs: {
          cif_asset_link_count: 1,
          cif_process_link_count: 1,
          tier_cif_chain: true,
          tier_max_rank_at_least_high: true,
          tier_substitutability_match: true,
          cloud_service_link_count: 0,
          manual_process_link_count: 1,
          transitive_process_pair_count: 1,
          missing_for_completeness: [],
        },
        transitive_process_links: [{
          process_id: 9911,
          process_name: 'UX-24 Transitive Process',
          process_cif: 'yes',
          process_criticality: 'critical',
          vendor_id: vendorId,
          vendor_name: String(vendor.name),
          via_asset_id: 9912,
          via_asset_name: 'UX-24 Asset',
        }],
      };
      await route.fulfill({ response, json: vendor });
    });
    await page.route('**/api/v1/vendors/*/contracts?*', async (route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 9913,
          vendor_id: vendorId,
          contract_reference: 'UX-24-ARCHIVED-CONTRACT',
          is_archived: true,
          created_at: '2026-08-20T00:00:00Z',
          updated_at: '2026-08-20T00:00:00Z',
        }]),
      });
    });
    await page.route('**/api/v1/vendors/*/linked-kris', async (route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 9902,
          risk_id: 1,
          metric_name: 'UX-24 Linked KRI',
          description: 'Deterministic card contract fixture.',
          current_value: 4,
          lower_limit: 0,
          upper_limit: 10,
          unit: '%',
          frequency: 'quarterly',
          monitoring_status: 'optimal',
          is_archived: false,
        }]),
      });
    });
    await page.route('**/api/v1/vendors/*/linked-controls', async (route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 9904,
          name: 'UX-24 Linked Control',
          frequency: 'monthly',
          risk_level: 3,
          monitoring_status: 'passed',
          department_name: 'Operations',
          status: 'active',
          is_archived: false,
        }]),
      });
    });
    await page.route('**/api/v1/vendors/*/linked-risks', async (route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 9905,
          risk_id_code: 'UX-24-R',
          name: 'UX-24 Linked Risk',
          process: 'Claims',
          risk_type: 'operational',
          gross_score: 12,
          net_score: 8,
          is_priority: false,
          department_name: 'Operations',
          status: 'active',
          is_archived: false,
        }]),
      });
    });
    await page.route(`**/api/v1/vendors/${vendorId}/sub-outsourcing?*`, async (route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      const derivedBase = {
        contract_reference: 'UX-24-ARCHIVED-CONTRACT',
        contract_vendor_id: vendorId,
        contract_vendor_name: 'UX-24 Vendor',
        critical_service: 'Ano',
        roi_scope: 'Ano',
      };
      const entryBase = {
        vendor_id: vendorId,
        contract_id: 9913,
        predecessor_id: null,
        person_type: 'company',
        identifier_type: 'registration',
        country: 'CZ',
        ict_service_code: 'S17',
        is_archived: false,
        capabilities: null,
        created_at: '2026-08-28T00:00:00Z',
        updated_at: '2026-08-28T00:00:00Z',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          ...entryBase,
          id: 9915,
          sub_provider_name: 'UX-24 Broken Chain Provider',
          identifier_value: 'UX24-BROKEN',
          derived: {
            ...derivedBase,
            rank: null,
            chain_check: 'CHYBA ŘETĚZCE',
            inputs: {
              contract_id: 9913,
              predecessor_id: null,
              predecessor_rank: null,
              is_direct: true,
              duplicate_key_count: 1,
            },
          },
        }, {
          ...entryBase,
          id: 9916,
          sub_provider_name: 'UX-24 Duplicate Provider',
          identifier_value: 'UX24-DUPLICATE',
          derived: {
            ...derivedBase,
            rank: 2,
            chain_check: 'DUPLICITA',
            inputs: {
              contract_id: 9913,
              predecessor_id: null,
              predecessor_rank: null,
              is_direct: true,
              duplicate_key_count: 2,
            },
          },
        }]),
      });
    });
    await visit(page, vendorRoute);
    const vendorBackButton = page.getByRole('button', { name: 'Back to Register' });
    await vendorBackButton.hover();
    await expect.poll(
      () => vendorBackButton.evaluate((element) => getComputedStyle(element).color),
      { message: 'Vendor detail Back action reaches the readable hover foreground' },
    ).toBe(lightSecondaryForeground);
    await expect.poll(
      () => vendorBackButton.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'Vendor detail Back action reaches the secondary hover surface' },
    ).toBe(lightSecondaryHover);
    const accentText = await resolveThemeColor(page, 'color', 'hsl(var(--accent-text))');
    const linkedControlCard = page.getByRole('button', { name: /UX-24 Linked Control/i });
    const linkedControlTitle = linkedControlCard.getByRole('heading', { name: 'UX-24 Linked Control' });
    await expectSemanticFocusRing(page, linkedControlCard, 'Vendor linked Control card');
    await linkedControlCard.hover();
    await expect.poll(
      () => linkedControlTitle.evaluate((element) => getComputedStyle(element).color),
      { message: 'linked Control title reaches the readable hover foreground' },
    ).toBe(accentText);
    expect(await linkedControlCard.locator('svg rect').nth(1)
      .evaluate((element) => getComputedStyle(element).color)).toBe(successGaugeZone);
    const linkedRiskCard = page.getByRole('button', { name: /UX-24 Linked Risk/i });
    const linkedRiskTitle = linkedRiskCard.getByRole('heading', { name: /UX-24-R: UX-24 Linked Risk/ });
    await expectSemanticFocusRing(page, linkedRiskCard, 'Vendor linked Risk card');
    await linkedRiskCard.hover();
    await expect.poll(
      () => linkedRiskTitle.evaluate((element) => getComputedStyle(element).color),
      { message: 'linked Risk title reaches the readable hover foreground' },
    ).toBe(accentText);
    const linkedKriCard = page.getByRole('button', { name: /UX-24 Linked KRI/i });
    expect(await linkedKriCard.locator('svg rect').nth(1)
      .evaluate((element) => getComputedStyle(element).color)).toBe(successGaugeZone);
    await expectReadableTypography(linkedKriCard.getByText('Metric Detail'), 'KRI gauge descriptor');
    await expectReadableTypography(linkedKriCard.getByText(/min$/), 'KRI gauge minimum');
    await expectReadableTypography(linkedKriCard.getByText(/max$/), 'KRI gauge maximum');
    for (const heading of await page.getByTestId('vendor-derived-transitive').locator('thead th').all()) {
      await expectReadableTypography(heading, 'Vendor derived table heading');
    }
    await expectReadableTypography(
      page.getByTestId('vendor-contracts-archived').getByRole('heading'),
      'Archived-contract heading',
    );
    await expectReadableTypography(
      page.getByTestId('vendor-sub-outsourcing-chain-error-9915'),
      'Sub-outsourcing chain-error status',
    );
    await expectReadableTypography(
      page.getByText('Duplicate', { exact: true }),
      'Sub-outsourcing duplicate status',
    );
    for (const criticalStatus of await page.getByText('Critical service', { exact: true }).all()) {
      await expectReadableTypography(criticalStatus, 'Sub-outsourcing critical-service status');
    }
    const kriCardBefore = await linkedKriCard.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, transitionProperty: style.transitionProperty };
    });
    expect(kriCardBefore.transitionProperty).not.toContain('all');
    await linkedKriCard.hover();
    await expect.poll(
      () => linkedKriCard.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'KRI action card reaches its named hover surface' },
    ).not.toBe(kriCardBefore.backgroundColor);

    await page.route('**/api/v1/vendors?*', async (route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const payload = await response.json() as { items?: Array<Record<string, unknown>> };
      if (payload.items?.[0]) {
        payload.items[0] = {
          ...payload.items[0],
          is_archived: true,
          capabilities: {
            ...(payload.items[0].capabilities as Record<string, unknown> | undefined),
            can_restore: true,
          },
        };
      }
      await route.fulfill({ response, json: payload });
    });
    await visit(page, '/vendors');
    const vendorRow = page.locator('main tbody tr').first();
    await expectReadableTypography(
      vendorRow.locator('td').nth(0).locator('span').nth(1),
      'Vendor process metadata',
    );
    await expectReadableTypography(
      vendorRow.locator('td').nth(2).locator('span.flex.flex-col > span').last(),
      'Vendor owner metadata',
    );
    await expectReadableTypography(
      vendorRow.getByText('Inactive', { exact: true }),
      'Vendor status',
    );
    await expectReadableTypography(
      vendorRow.getByRole('button', { name: 'Unarchive' }),
      'Vendor Unarchive action',
    );

    await visit(page, '/processes');
    await page.getByRole('button', { name: 'By Department' }).click();
    const registerGroupCard = page.getByTestId('register-group-card').first();
    await expect(registerGroupCard).toBeVisible();
    expect(await registerGroupCard.getByRole('heading')
      .evaluate((element) => getComputedStyle(element).color)).toBe(lightForeground);
    expect(await registerGroupCard.locator('p').first()
      .evaluate((element) => getComputedStyle(element).color)).toBe(lightForeground);
    const registerCardBefore = await registerGroupCard.evaluate((element) => ({
      backgroundColor: getComputedStyle(element).backgroundColor,
      transitionProperty: getComputedStyle(element).transitionProperty,
    }));
    expect(registerCardBefore.transitionProperty).not.toContain('all');
    await registerGroupCard.hover();
    await expect.poll(
      () => registerGroupCard.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'register action card reaches its named hover surface' },
    ).not.toBe(registerCardBefore.backgroundColor);
    await registerGroupCard.click();
    const registerBackButton = page.getByRole('button', { name: /Back/i });
    await expect(registerBackButton).toBeVisible();
    expect(await registerBackButton.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightMutedForeground);
    await registerBackButton.hover();
    await expect.poll(
      () => registerBackButton.evaluate((element) => getComputedStyle(element).color),
      { message: 'selected register Back action reaches the readable hover foreground' },
    ).toBe(lightForeground);
    expect(await registerBackButton.locator('..').getByRole('heading')
      .evaluate((element) => getComputedStyle(element).color)).toBe(lightForeground);

    await page.route('**/api/v1/orphaned-items/overview*', async (route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          stats: {
            risk_count: 1,
            control_count: 0,
            kri_count: 0,
            threat_count: 0,
            process_count: 0,
            asset_count: 0,
            vendor_count: 1,
            total_count: 2,
          },
          items: [{
            id: 9910,
            item_type: 'risk',
            item_id: 9910,
            item_name: 'UX-24 Orphaned Risk',
            item_description: 'Deterministic Governance readability fixture.',
            item_identifier: 'UX-24-ORPHAN',
            department_name: 'Operations',
            previous_owner_name: 'Former Owner',
            previous_owner_email: 'former.owner@example.test',
            orphaned_at: '2026-08-20T00:00:00Z',
            status: 'pending',
            request_reason_required: false,
            capabilities: {
              can_resolve: true,
              can_view_detail: true,
              requires_department: false,
              requires_owner: true,
              requires_risk: false,
            },
          }, {
            id: 9914,
            item_type: 'vendor',
            item_id: 9914,
            responsibility_role: 'outsourcing_owner',
            item_name: 'UX-24 Orphaned Vendor',
            item_description: 'Deterministic uncategorised responsibility fixture.',
            item_identifier: 'UX-24-VENDOR-ORPHAN',
            department_name: 'Uncategorised',
            previous_owner_name: 'Vendor Former Owner',
            previous_owner_email: 'vendor.former@example.test',
            orphaned_at: '2026-08-20T00:00:00Z',
            status: 'pending',
            request_reason_required: false,
            capabilities: {
              can_resolve: false,
              can_view_detail: false,
              requires_department: true,
              requires_owner: true,
              requires_risk: false,
            },
          }],
          last_scan_at: '2026-08-28T00:00:00Z',
          scan_status: 'succeeded',
        }),
      });
    });
    await visit(page, '/governance');
    const governanceHeading = page.getByRole('heading', { name: 'Governance Oversight' });
    expect(await governanceHeading.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightForeground);
    const governanceActionCard = page.getByTestId('governance-filter-card-risk');
    const governanceStaticCard = page.getByTestId('governance-filter-card-total');
    await expect(governanceActionCard).toBeVisible();
    await expect(governanceStaticCard).toBeVisible();
    expect(await governanceActionCard.getByText('Pending Orphans', { exact: true })
      .evaluate((element) => getComputedStyle(element).color)).toBe(lightMutedForeground);
    expect(await governanceActionCard.getByRole('heading', { level: 3 })
      .evaluate((element) => getComputedStyle(element).color)).toBe(lightForeground);
    const governanceCardLabels = [
      ['risk', 'Risks', 'Action Required'],
      ['control', 'Controls', 'Critical'],
      ['kri', 'KRIs', 'Needs Linkage'],
      ['threat', 'Threats', 'Action Required'],
      ['process', 'Processes', 'Action Required'],
      ['asset', 'Assets', 'Action Required'],
      ['vendor', 'Vendors', 'Action Required'],
      ['total', 'Total', 'Grand Total'],
    ] as const;
    for (const [id, subtitle, trend] of governanceCardLabels) {
      const card = page.getByTestId(`governance-filter-card-${id}`);
      await expectReadableTypography(card.getByText(subtitle, { exact: true }), `${subtitle} card subtitle`);
      await expectReadableTypography(card.getByText(trend, { exact: true }), `${subtitle} card trend`);
    }
    await expectReadableTypography(
      page.getByText('Orphaned Risks', { exact: true }),
      'Governance Orphaned Risks section label',
    );
    const orphanedTable = page.getByTestId('governance-orphaned-table');
    expect(await orphanedTable.getByRole('heading', { name: 'Orphaned Items (1)' })
      .evaluate((element) => getComputedStyle(element).color)).toBe(lightForeground);
    for (const text of [
      'Risk',
      'UX-24 Orphaned Risk',
      'Former Owner',
    ]) {
      expect(await orphanedTable.getByText(text, { exact: true })
        .evaluate((element) => getComputedStyle(element).color)).toBe(lightForeground);
    }
    const governanceRiskStateAxe = await new AxeBuilder({ page })
      .include('[data-testid="governance-orphaned-table"]')
      .withRules(['color-contrast'])
      .analyze();
    expect(
      governanceRiskStateAxe.violations,
      JSON.stringify(governanceRiskStateAxe.violations, null, 2),
    ).toEqual([]);
    await page.getByTestId('governance-filter-card-vendor').click();
    await expect(orphanedTable.getByText('UX-24 Orphaned Vendor', { exact: true })).toBeVisible();
    for (const text of ['Vendor', 'UX-24 Orphaned Vendor', 'Vendor Former Owner']) {
      expect(await orphanedTable.getByText(text, { exact: true })
        .evaluate((element) => getComputedStyle(element).color)).toBe(lightForeground);
    }
    const responsibility = orphanedTable.getByText('Outsourcing Owner responsibility', { exact: true });
    const uncategorised = orphanedTable.getByText('Uncategorised', { exact: true });
    await expectReadableTypography(responsibility, 'Governance responsibility metadata');
    await expectReadableTypography(uncategorised, 'Governance uncategorised metadata');
    expect(await responsibility.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightMutedForeground);
    expect(await uncategorised.evaluate((element) => getComputedStyle(element).color))
      .toBe(lightWarningForeground);
    expect(await uncategorised.locator('..').evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe(lightWarning);
    const vendorOrphanRow = orphanedTable.getByRole('row').filter({ hasText: 'UX-24 Orphaned Vendor' });
    await vendorOrphanRow.hover();
    await expect.poll(
      () => vendorOrphanRow.getByText('UX-24 Orphaned Vendor', { exact: true })
        .evaluate((element) => getComputedStyle(element).color),
      { message: 'orphaned item title reaches the readable hover foreground' },
    ).toBe(lightAccentText);
    const governanceVendorStateAxe = await new AxeBuilder({ page })
      .include('[data-testid="governance-orphaned-table"]')
      .withRules(['color-contrast'])
      .analyze();
    expect(
      governanceVendorStateAxe.violations,
      JSON.stringify(governanceVendorStateAxe.violations, null, 2),
    ).toEqual([]);
    await governanceActionCard.click();
    await expect(orphanedTable.getByText('UX-24 Orphaned Risk', { exact: true })).toBeVisible();
    const orphanOwnerEmail = page.locator('main tbody tr').first().locator('td').nth(4).locator('p').last();
    await expectReadableTypography(orphanOwnerEmail, 'Governance orphan owner email');
    const governanceActionBefore = await governanceActionCard.evaluate((element) => getComputedStyle(element).backgroundColor);
    const governanceStaticBefore = await governanceStaticCard.evaluate((element) => ({
      backgroundColor: getComputedStyle(element).backgroundColor,
      transitionProperty: getComputedStyle(element).transitionProperty,
    }));
    await governanceActionCard.hover();
    await expect.poll(
      () => governanceActionCard.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'governance action card reaches its hover surface' },
    ).not.toBe(governanceActionBefore);
    await governanceStaticCard.hover();
    expect(await governanceStaticCard.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe(governanceStaticBefore.backgroundColor);
    expect(governanceStaticBefore.transitionProperty).toBe('none');

    const resolveButton = page.getByRole('button', { name: /Resolve/i }).first();
    await resolveButton.click();
    const resolveDialog = page.getByRole('dialog');
    await expect(resolveDialog).toBeVisible();
    const resolveSubmitButton = resolveDialog.getByRole('button', { name: /Resolve Item|Link Risk|Submit for Approval/i });
    await resolveSubmitButton.hover();
    await expect.poll(
      () => resolveSubmitButton.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'Resolve primary action reaches the opaque accent hover token' },
    ).toBe(accentHover);
    await resolveDialog.getByRole('button', { name: 'Close' }).click();

    await visit(page, '/vendors/new');
    const vendorPrimaryButton = page.getByRole('button', { name: 'Create' });
    await vendorPrimaryButton.hover();
    await expect.poll(
      () => vendorPrimaryButton.evaluate((element) => getComputedStyle(element).backgroundColor),
      { message: 'Vendor primary action reaches the opaque accent hover token' },
    ).toBe(accentHover);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await visit(page, '/departments');
    await expect.poll(async () => page.evaluate(() => (
      document.getAnimations().filter((animation) => animation.playState === 'running').length
    )), { message: 'reduced-motion leaves no running animations' }).toBe(0);
  });
});
