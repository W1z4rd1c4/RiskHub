import AxeBuilder from '@axe-core/playwright';
import type { Page, Request } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';
import {
    assertZeroAxeFindings,
    WCAG_TAGS,
    toFindings,
} from './helpers/axeBaseline';
import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';

const ENTITY_TABS = [
    'overview',
    'risks',
    'controls',
    'kris',
    'issues',
    'processes',
    'assets',
    'vendors',
    'users',
    'activity',
] as const;

const OVERVIEW_CARDS = [
    'risks',
    'controls',
    'kris',
    'issues',
    'processes',
    'assets',
    'vendors',
    'users',
] as const;

const REPRESENTATIVE_HEALTH_ACTIONS = [
    { card: 'risks', action: 'high', tab: 'risks', pathname: '/api/v1/risks', filters: { net_band: 'Vysoké' } },
    { card: 'controls', action: 'attention', tab: 'controls', pathname: '/api/v1/controls', filters: { monitoring_status: 'needs_review' } },
    { card: 'kris', action: 'breach', tab: 'kris', pathname: '/api/v1/kris', filters: { monitoring_status: 'breach' } },
    { card: 'issues', action: 'open', tab: 'issues', pathname: '/api/v1/issues', filters: { status: 'open' } },
    { card: 'processes', action: 'cif', tab: 'processes', pathname: '/api/v1/processes', filters: { cif: true } },
    { card: 'assets', action: 'legacy', tab: 'assets', pathname: '/api/v1/assets', filters: { legacy: true } },
    { card: 'vendors', action: 'dora', tab: 'vendors', pathname: '/api/v1/vendors', filters: { dora_relevant: true } },
    { card: 'users', action: 'active', tab: 'users', pathname: '/api/v1/access/users/my-department', filters: {} },
] as const;

function filtersFromUrl(url: URL): Record<string, unknown> {
    const raw = url.searchParams.get('filters');
    if (!raw) return {};
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function collectionFilters(request: Request): Record<string, unknown> {
    return filtersFromUrl(new URL(request.url()));
}

function isDepartmentScopedCollectionRequest(
    request: Request,
    pathname: string,
    departmentId: number,
): boolean {
    const url = new URL(request.url());
    if (request.method() !== 'GET' || url.pathname !== pathname) return false;
    const filters = collectionFilters(request);
    const expectedDirect = url.searchParams.get('department_id') === String(departmentId);
    const expectedScalar = filters.department_id === departmentId;
    const expectedPlural = Array.isArray(filters.department_ids)
        && filters.department_ids.length === 1
        && filters.department_ids[0] === departmentId;
    return expectedDirect || expectedScalar || expectedPlural;
}

async function openSeededDepartment(page: Page): Promise<number> {
    // Base seeding is a prerequisite of the deterministic E2E fixture contract.
    // Finance is the stable department fixture with ID 2.
    const departmentId = 2;
    await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);
    const authProof = await page.evaluate(async () => {
        const config = await fetch('/api/v1/auth/config', { credentials: 'include' });
        const csrf = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
        const csrfToken = document.cookie
            .split('; ')
            .find((entry) => entry.startsWith('riskhub_csrf_token='))
            ?.split('=')
            .slice(1)
            .join('=') ?? '';
        const refresh = await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-CSRF-Token': decodeURIComponent(csrfToken) },
        });
        return { config: config.status, csrf: csrf.status, refresh: refresh.status };
    });
    expect(authProof).toEqual({ config: 200, csrf: 204, refresh: 200 });
    const detailResponse = page.waitForResponse((response) => (
        response.request().method() === 'GET'
        && new URL(response.url()).pathname === `/api/v1/departments/${departmentId}`
    ));
    await page.evaluate((id) => {
        window.history.pushState({}, '', `/departments/${id}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
    }, departmentId);
    expect((await detailResponse).status()).toBe(200);
    await expect(page.getByTestId('department-detail-tabs')).toBeVisible({ timeout: 15000 });
    return departmentId;
}

test.describe('Department metric drill-down (#90)', () => {
    test('exposes exactly the ten contracted tabs and eight overview cards', async ({ page }) => {
        await openSeededDepartment(page);

        const tabs = page.getByRole('tab');
        await expect(tabs).toHaveCount(10);
        for (const [index, tab] of ENTITY_TABS.entries()) {
            await expect(tabs.nth(index)).toHaveAttribute('data-department-tab', tab);
        }
        await expect(page.getByRole('tab', { name: /threat/i })).toHaveCount(0);

        await page.getByRole('tab', { name: /overview|přehled/i }).click();
        for (const entity of OVERVIEW_CARDS) {
            await expect(page.getByTestId(`department-overview-card-${entity}`)).toBeVisible();
        }
        const cardSelector = OVERVIEW_CARDS
            .map((card) => `[data-testid="department-overview-card-${card}"]`)
            .join(',');
        await expect(page.locator(cardSelector)).toHaveCount(8);
        await expect(page.getByTestId('department-overview-activity')).toBeVisible();
    });

    test('keeps canonical register state URL-backed without allowing scope removal', async ({ page }) => {
        const riskManagerPage = page;
        const departmentId = await openSeededDepartment(page);

        const initialProcessesRequest = riskManagerPage.waitForRequest((request) => (
            isDepartmentScopedCollectionRequest(request, '/api/v1/processes', departmentId)
        ));
        await riskManagerPage.getByRole('tab', { name: /process/i }).click();
        await initialProcessesRequest;
        await expect(riskManagerPage).toHaveURL((url) => url.searchParams.get('tab') === 'processes');
        await expect(riskManagerPage.getByTestId('processes-register-shell')).toBeVisible();

        const searchRequest = riskManagerPage.waitForRequest((request) => {
            if (!isDepartmentScopedCollectionRequest(request, '/api/v1/processes', departmentId)) return false;
            const url = new URL(request.url());
            return url.searchParams.get('search') === 'department tracer'
                || collectionFilters(request).search === 'department tracer';
        });
        await riskManagerPage.getByTestId('processes-search-input').fill('department tracer');
        await searchRequest;
        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('tab') === 'processes'
            && url.searchParams.get('q') === 'department tracer'
        ));

        await riskManagerPage.getByTestId('processes-add-filter').selectOption('cif');
        const cifRequest = riskManagerPage.waitForRequest((request) => {
            if (!isDepartmentScopedCollectionRequest(request, '/api/v1/processes', departmentId)) return false;
            return collectionFilters(request).cif === true;
        });
        await riskManagerPage.getByTestId('processes-filter-control-cif').locator('select').selectOption('true');
        await cifRequest;

        const clearRequest = riskManagerPage.waitForRequest((request) => (
            isDepartmentScopedCollectionRequest(request, '/api/v1/processes', departmentId)
        ));
        await riskManagerPage.getByTestId('processes-clear-filters').click();
        await clearRequest;

        const exportRequest = riskManagerPage.waitForRequest((request) => (
            isDepartmentScopedCollectionRequest(request, '/api/v1/processes/export', departmentId)
        ));
        await riskManagerPage.getByTestId('processes-export-button').click();
        await riskManagerPage.getByTestId('export-submit-button').click();
        await exportRequest;

        await riskManagerPage.getByRole('tab', { name: /asset/i }).click();
        await expect(riskManagerPage).toHaveURL((url) => url.searchParams.get('tab') === 'assets');
        await riskManagerPage.goBack();
        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('tab') === 'processes'
            && url.searchParams.get('q') === 'department tracer'
        ));
        await expect(riskManagerPage.getByTestId('processes-register-shell')).toBeVisible();

        const resetSearchRequest = riskManagerPage.waitForRequest((request) => (
            isDepartmentScopedCollectionRequest(request, '/api/v1/processes', departmentId)
            && new URL(request.url()).searchParams.get('search') === null
        ));
        await riskManagerPage.getByTestId('processes-search-input').fill('');
        await resetSearchRequest;
        const firstProcessLink = riskManagerPage.locator('tbody tr').first().getByRole('link');
        await expect(firstProcessLink).toBeVisible();
        await firstProcessLink.click();
        await expect(riskManagerPage).toHaveURL(/\/processes\/\d+$/);
    });

    test('opens every metric family with its exact health filter and locked Department scope', async ({ page }) => {
        const departmentId = await openSeededDepartment(page);

        for (const health of REPRESENTATIVE_HEALTH_ACTIONS) {
            const requestPromise = page.waitForRequest((request) => (
                request.method() === 'GET'
                && new URL(request.url()).pathname === health.pathname
            ));
            await page.getByTestId(`department-overview-card-${health.card}-${health.action}`).click();
            const request = await requestPromise;
            expect(isDepartmentScopedCollectionRequest(request, health.pathname, departmentId)).toBe(true);
            const requestUrl = new URL(request.url());
            const requestFilters = collectionFilters(request);
            for (const [key, value] of Object.entries(health.filters)) {
                expect(requestFilters[key] ?? requestUrl.searchParams.get(key)).toEqual(value);
            }
            await expect(page).toHaveURL((url) => {
                const filters = filtersFromUrl(url);
                return url.searchParams.get('tab') === health.tab
                    && Object.entries(health.filters).every(([key, value]) => filters[key] === value);
            });

            await page.getByRole('tab', { name: /overview|přehled/i }).click();
            await expect(page.getByTestId(`department-overview-card-${health.card}`)).toBeVisible();
        }
    });

    test('renders the exact 4x2 desktop grid, supported reflow, full-width activity, and zero axe findings', async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await openSeededDepartment(page);

        const grid = page.getByTestId('department-stats-grid');
        const activity = page.getByTestId('department-overview-activity');
        await expect(grid).toBeVisible();
        const desktopColumns = await grid.evaluate((element) => (
            getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length
        ));
        expect(desktopColumns).toBe(4);

        const cardSelector = OVERVIEW_CARDS
            .map((card) => `[data-testid="department-overview-card-${card}"]`)
            .join(',');
        const cards = page.locator(cardSelector);
        await expect(cards).toHaveCount(8);
        const cardBoxes = await cards.evaluateAll((elements) => elements.map((element) => {
            const box = element.getBoundingClientRect();
            return { x: box.x, y: box.y };
        }));
        expect(new Set(cardBoxes.slice(0, 4).map(({ y }) => Math.round(y))).size).toBe(1);
        expect(new Set(cardBoxes.slice(4).map(({ y }) => Math.round(y))).size).toBe(1);
        expect(cardBoxes[4].y).toBeGreaterThan(cardBoxes[0].y);

        const gridBox = await grid.boundingBox();
        const activityBox = await activity.boundingBox();
        expect(gridBox).not.toBeNull();
        expect(activityBox).not.toBeNull();
        expect(activityBox!.y).toBeGreaterThan(gridBox!.y + gridBox!.height);
        expect(Math.abs(activityBox!.x - gridBox!.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(activityBox!.width - gridBox!.width)).toBeLessThanOrEqual(1);

        await testInfo.attach('department-overview-1440x1000', {
            body: await page.locator('main').screenshot(),
            contentType: 'image/png',
        });

        await page.setViewportSize({ width: 1024, height: 1000 });
        await expect(grid).toBeVisible();
        const supportedReflowColumns = await grid.evaluate((element) => (
            getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length
        ));
        expect(supportedReflowColumns).toBe(2);
        await testInfo.attach('department-overview-1024x1000', {
            body: await page.locator('main').screenshot(),
            contentType: 'image/png',
        });

        const analysis = await new AxeBuilder({ page })
            .withTags([...WCAG_TAGS])
            .include('[data-testid="department-stats-grid"]')
            .analyze();
        assertZeroAxeFindings(toFindings(analysis.violations), 'department metric cards');
    });
});
