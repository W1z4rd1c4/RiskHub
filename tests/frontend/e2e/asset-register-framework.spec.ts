/**
 * Issue #78 — Asset migration onto the shared register shell.
 *
 * Filter algebra, scoped facets/lookups, and permission boundaries are covered
 * exhaustively at the backend seam. These tests keep the browser proof narrow:
 * public URL state, stable controls, representative requests, export, and
 * visible capability/access states.
 */
import type { Page, Request } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';
import { E2E_ASSETS } from './fixtures/e2e-data';
import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';

const ASSET_LIST_PATH = '/api/v1/assets';

function isAssetListRequest(request: Request): boolean {
    if (request.method() !== 'GET') return false;
    return new URL(request.url()).pathname === ASSET_LIST_PATH;
}

function waitForAssetList(page: Page, predicate: (url: URL) => boolean = () => true) {
    return page.waitForRequest((request) => (
        isAssetListRequest(request) && predicate(new URL(request.url()))
    ));
}

function isDefaultActiveRequest(url: URL): boolean {
    const lifecycle = url.searchParams.getAll('lifecycle');
    return url.searchParams.get('include_archived') !== 'true'
        && (lifecycle.length === 0 || lifecycle.join(',') === 'active');
}

async function waitForRegisterReady(page: Page): Promise<void> {
    await expect(page.getByTestId('assets-register-shell')).toBeVisible();
    await expect(page.getByTestId('sortable-table-skeleton')).toHaveCount(0, { timeout: 30_000 });
}

test.describe('ICT Register — shared Asset register framework (#78)', () => {
    test('seven keyboard-operable views preserve unrelated URL state and restore grouped drill-down', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/assets?source=external-review&page=9');
        await waitForRegisterReady(riskManagerPage);

        const viewContracts = [
            ['all', null],
            ['department', 'department'],
            ['business_owner', 'business_owner'],
            ['type', 'type'],
            ['criticality', 'criticality'],
            ['process', 'process'],
            ['vendor', 'vendor'],
        ] as const;

        for (const [view, groupBy] of viewContracts) {
            const viewButton = riskManagerPage.getByTestId(`assets-view-${view}`);
            await expect(viewButton).not.toHaveAttribute('role', 'tab');
            if (view === 'all') {
                await expect(viewButton).toHaveAttribute('aria-pressed', 'true');
                expect(new URL(riskManagerPage.url()).searchParams.get('source')).toBe('external-review');
                continue;
            }

            await viewButton.focus();
            await Promise.all([
                waitForAssetList(riskManagerPage, (url) => (
                    url.searchParams.get('view') === view
                    && url.searchParams.get('group_by') === groupBy
                    && url.searchParams.get('source') === null
                    && isDefaultActiveRequest(url)
                )),
                riskManagerPage.keyboard.press('Enter'),
            ]);
            await expect(viewButton).toHaveAttribute('aria-pressed', 'true');

            const browserUrl = new URL(riskManagerPage.url());
            expect(browserUrl.searchParams.get('source')).toBe('external-review');
            expect(browserUrl.searchParams.has('page')).toBe(false);
            expect(browserUrl.searchParams.get('view')).toBe(view);

            if (view === 'criticality') {
                const groups = riskManagerPage.getByTestId('register-group-card');
                await expect(groups.first()).toBeVisible();
                await expect(groups.first()).not.toContainText('criticality:');
                await expect(groups.first()).toContainText(/Low|Medium|High|Critical|Nízká|Střední|Vysoká|Kritická/);
            }
        }

        await Promise.all([
            waitForAssetList(riskManagerPage, (url) => url.searchParams.get('group_by') === 'department'),
            riskManagerPage.getByTestId('assets-view-department').click(),
        ]);
        const firstGroup = riskManagerPage.getByTestId('register-group-card').first();
        await expect(firstGroup).toBeVisible();
        const groupValue = await firstGroup.getAttribute('data-group-value');
        expect(groupValue).toBeTruthy();

        await Promise.all([
            waitForAssetList(riskManagerPage, (url) => url.searchParams.get('group_value') === groupValue),
            firstGroup.click(),
        ]);
        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('source') === 'external-review'
            && url.searchParams.get('view') === 'department'
            && url.searchParams.get('group') === groupValue
        ));
        await expect(riskManagerPage.locator('table')).toBeVisible();

        await riskManagerPage.goBack();
        await expect(riskManagerPage).toHaveURL((url) => !url.searchParams.has('group'));
        await expect(riskManagerPage.getByTestId('register-group-card').first()).toBeVisible();

        await riskManagerPage.goForward();
        await expect(riskManagerPage).toHaveURL((url) => url.searchParams.get('group') === groupValue);
        await riskManagerPage.reload();
        await waitForRegisterReady(riskManagerPage);
        await expect(riskManagerPage.locator('table')).toBeVisible();
    });

    test('search plus ownership and technology filters are URL-backed, ANDed, chipped, and cleared', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/assets?source=external-review&page=4');
        await waitForRegisterReady(riskManagerPage);

        const searchInput = riskManagerPage.getByTestId('assets-search-input');
        await searchInput.fill('E2E-ASSET');
        await waitForAssetList(riskManagerPage, (url) => url.searchParams.get('search') === 'E2E-ASSET');
        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('q') === 'E2E-ASSET'
            && url.searchParams.get('source') === 'external-review'
            && !url.searchParams.has('page')
        ));

        await riskManagerPage.getByTestId('assets-add-filter').selectOption('business_owner_ids');
        const ownerControl = riskManagerPage.getByTestId('assets-filter-control-business_owner_ids');
        await expect(ownerControl).toBeVisible();
        const ownerOption = ownerControl.locator('[data-testid^="assets-filter-business_owner_ids-option-"]').first();
        await expect(ownerOption).toBeVisible();
        const ownerRequestPromise = waitForAssetList(riskManagerPage, (url) => {
            const filters = JSON.parse(url.searchParams.get('filters') ?? '{}') as Record<string, unknown>;
            return Array.isArray(filters.business_owner_ids)
                && filters.business_owner_ids.length === 1
                && url.searchParams.get('search') === 'E2E-ASSET'
                && url.searchParams.get('source') === null;
        });
        await ownerOption.click();
        await ownerRequestPromise;

        await riskManagerPage.getByTestId('assets-add-filter').selectOption('asset_types');
        const typeControl = riskManagerPage.getByTestId('assets-filter-control-asset_types');
        const typeOption = typeControl.locator('input[type="checkbox"]:not(:disabled)').first();
        await expect(typeOption).toBeVisible();
        const combinedRequestPromise = waitForAssetList(riskManagerPage, (url) => {
            const filters = JSON.parse(url.searchParams.get('filters') ?? '{}') as Record<string, unknown>;
            return Array.isArray(filters.business_owner_ids)
                && filters.business_owner_ids.length === 1
                && Array.isArray(filters.asset_types)
                && filters.asset_types.length === 1
                && url.searchParams.get('search') === 'E2E-ASSET';
        });
        await typeOption.check();
        await combinedRequestPromise;

        await expect(riskManagerPage.getByTestId('assets-filter-chip-business_owner_ids')).toBeVisible();
        await expect(riskManagerPage.getByTestId('assets-filter-chip-asset_types')).toBeVisible();

        await riskManagerPage.getByTestId('assets-clear-filters').click();
        await expect(riskManagerPage.getByTestId('assets-filter-chip-business_owner_ids')).toHaveCount(0);
        await expect(riskManagerPage.getByTestId('assets-filter-chip-asset_types')).toHaveCount(0);
        await expect(searchInput).toHaveValue('E2E-ASSET');
        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('q') === 'E2E-ASSET'
            && url.searchParams.get('source') === 'external-review'
        ));
    });

    test('export uses the selected visible Process group, omits pagination, and carries code/label columns', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/assets?source=external-review&view=process&q=E2E-ASSET');
        await waitForRegisterReady(riskManagerPage);
        const firstGroup = riskManagerPage.getByTestId('register-group-card').first();
        await expect(firstGroup).toBeVisible();
        const groupValue = await firstGroup.getAttribute('data-group-value');
        expect(groupValue).toBeTruthy();
        await Promise.all([
            waitForAssetList(riskManagerPage, (url) => url.searchParams.get('group_value') === groupValue),
            firstGroup.click(),
        ]);

        await riskManagerPage.getByTestId('assets-export-button').click();
        await expect(riskManagerPage.getByTestId('assets-export-dialog')).toBeVisible();
        const responsePromise = riskManagerPage.waitForResponse((response) => (
            response.request().method() === 'GET'
            && new URL(response.url()).pathname === '/api/v1/assets/export'
        ));
        await riskManagerPage.getByTestId('export-submit-button').click();
        const response = await responsePromise;
        expect(response.ok()).toBe(true);

        const exportUrl = new URL(response.url());
        expect(exportUrl.searchParams.has('offset')).toBe(false);
        expect(exportUrl.searchParams.has('limit')).toBe(false);
        expect(exportUrl.searchParams.get('search')).toBe('E2E-ASSET');
        expect(exportUrl.searchParams.get('view')).toBe('process');
        expect(exportUrl.searchParams.get('group_by')).toBe('process');
        expect(exportUrl.searchParams.get('group_value')).toBe(groupValue);
        expect(exportUrl.searchParams.get('source')).toBeNull();
        expect(isDefaultActiveRequest(exportUrl)).toBe(true);
        expect(['en', 'cs']).toContain(exportUrl.searchParams.get('locale'));

        const csv = await response.text();
        expect(csv).toContain('asset_type_code,asset_type_label');
        expect(csv).toContain('criticality_code,criticality_label');
        expect(csv).toContain('data_classification_code,data_classification_label');
        await expect(riskManagerPage.getByTestId('assets-export-dialog')).not.toBeVisible();
    });

    test('failure offers keyboard retry and server-declared capabilities; denial clears stale rows and groups', async ({ riskManagerPage }) => {
        let forcedStatus: 500 | 403 | null = 500;
        await riskManagerPage.route('**/api/v1/assets?**', async (route) => {
            if (forcedStatus === null) {
                await route.continue();
                return;
            }
            await route.fulfill({
                status: forcedStatus,
                contentType: 'application/json',
                body: `{"detail":"synthetic #78 ${forcedStatus === 403 ? 'denial' : 'failure'}"}`,
            });
        });
        await riskManagerPage.goto('/assets');
        await expect(riskManagerPage.getByTestId('assets-register-shell')).toBeVisible();
        const retry = riskManagerPage.getByRole('button', { name: /Retry|Zkusit znovu/i });
        await expect(retry).toBeVisible();
        await retry.focus();
        forcedStatus = null;
        const responsePromise = riskManagerPage.waitForResponse((response) => (
            response.request().method() === 'GET'
            && new URL(response.url()).pathname === ASSET_LIST_PATH
        ));
        await riskManagerPage.keyboard.press('Enter');
        const response = await responsePromise;
        const body = await response.json() as { capabilities?: { can_create?: boolean; can_export?: boolean } };
        await expect(retry).toHaveCount(0);
        await expect(riskManagerPage.getByTestId('assets-create-button')).toHaveCount(body.capabilities?.can_create ? 1 : 0);
        await expect(riskManagerPage.getByTestId('assets-export-button')).toHaveCount(body.capabilities?.can_export ? 1 : 0);
        await expect(riskManagerPage.locator('table')).toBeVisible();

        forcedStatus = 403;
        await riskManagerPage.goto('/assets?access_probe=true');
        await expect(riskManagerPage.getByRole('heading', { name: /Access denied|Přístup odepřen/i })).toBeVisible();
        await expect(riskManagerPage.getByTestId('assets-register-shell')).toHaveCount(0);
        await expect(riskManagerPage.locator('table tbody tr')).toHaveCount(0);
        await expect(riskManagerPage.getByTestId('register-group-card')).toHaveCount(0);
    });

    test('an assigned cross-Department owner sees the owned row and only backend-declared actions', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
            await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS);
            await page.goto('/assets');
            await waitForRegisterReady(page);

            const responsePromise = page.waitForResponse((response) => (
                response.request().method() === 'GET'
                && new URL(response.url()).pathname === ASSET_LIST_PATH
                && new URL(response.url()).searchParams.get('search') === E2E_ASSETS.OWNER_SCOPED_ACTIVE.name
            ));
            await page.getByTestId('assets-search-input').fill(E2E_ASSETS.OWNER_SCOPED_ACTIVE.name);
            const response = await responsePromise;
            const body = await response.json() as { capabilities?: { can_create?: boolean; can_export?: boolean } };

            const ownedRow = page.locator('tr', { hasText: E2E_ASSETS.OWNER_SCOPED_ACTIVE.name });
            await expect(ownedRow).toBeVisible();
            await expect(page.getByTestId('assets-create-button')).toHaveCount(body.capabilities?.can_create ? 1 : 0);
            await expect(page.getByTestId('assets-export-button')).toHaveCount(body.capabilities?.can_export ? 1 : 0);

            await ownedRow.click();
            await expect(page.getByTestId('asset-detail-edit')).toBeVisible();
            await expect(page.getByTestId('asset-detail-archive')).toHaveCount(0);
            await expect(page.getByTestId('asset-detail-restore')).toHaveCount(0);
        } finally {
            await context.close();
        }
    });
});
