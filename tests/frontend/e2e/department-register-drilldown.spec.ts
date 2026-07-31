import type { Page, Request } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';
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

function collectionFilters(request: Request): Record<string, unknown> {
    const raw = new URL(request.url()).searchParams.get('filters');
    if (!raw) return {};
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function isDepartmentScopedCollectionRequest(
    request: Request,
    pathname: string,
    departmentId: number,
): boolean {
    const url = new URL(request.url());
    if (request.method() !== 'GET' || url.pathname !== pathname) return false;
    const filters = collectionFilters(request);
    const expectedScalar = filters.department_id === departmentId;
    const expectedPlural = Array.isArray(filters.department_ids)
        && filters.department_ids.length === 1
        && filters.department_ids[0] === departmentId;
    return expectedScalar || expectedPlural;
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

test.describe('Department register drill-down (#89)', () => {
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
        await expect(page.locator('[data-testid^="department-overview-card-"]')).toHaveCount(8);
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
});
