/**
 * Issue #77 — Process as the black-box tracer for the shared register shell.
 *
 * These checks intentionally use only the public URL, stable UI affordances,
 * and HTTP requests. Filter algebra and visibility are exhaustively covered at
 * the backend seam; this suite proves the representative browser workflow.
 */
import type { Page, Request } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';

const PROCESS_LIST_PATH = '/api/v1/processes';

function isProcessListRequest(request: Request): boolean {
    if (request.method() !== 'GET') return false;
    const url = new URL(request.url());
    return url.pathname === PROCESS_LIST_PATH;
}

function waitForProcessList(page: Page, predicate: (url: URL) => boolean = () => true) {
    return page.waitForRequest((request) => {
        if (!isProcessListRequest(request)) return false;
        return predicate(new URL(request.url()));
    });
}

async function waitForRegisterReady(page: Page): Promise<void> {
    await expect(page.getByTestId('processes-register-shell')).toBeVisible();
    await expect(page.getByTestId('sortable-table-skeleton')).toHaveCount(0, { timeout: 30_000 });
}

test.describe('ICT Register — shared Process register framework (#77)', () => {
    test('six keyboard-operable views preserve unrelated URL state and restore a grouped drill-down', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/processes?source=external-review&page=9');
        await waitForRegisterReady(riskManagerPage);

        const viewContracts = [
            ['all', null],
            ['department', 'department'],
            ['owner', 'owner'],
            ['l0', 'l0'],
            ['criticality', 'criticality'],
            ['vendor', 'vendor'],
        ] as const;

        for (const [view, groupBy] of viewContracts) {
            const viewButton = riskManagerPage.getByTestId(`processes-view-${view}`);
            await expect(viewButton).not.toHaveAttribute('role', 'tab');
            if (view === 'all') {
                await expect(viewButton).toHaveAttribute('aria-pressed', 'true');
                expect(new URL(riskManagerPage.url()).searchParams.get('source')).toBe('external-review');
                continue;
            }
            await viewButton.focus();
            await Promise.all([
                waitForProcessList(riskManagerPage, (url) => (
                    url.searchParams.get('view') === view
                    && url.searchParams.get('group_by') === groupBy
                    && url.searchParams.get('source') === null
                    && url.searchParams.getAll('lifecycle').join(',') === 'active'
                )),
                riskManagerPage.keyboard.press('Enter'),
            ]);
            await expect(viewButton).toHaveAttribute('aria-pressed', 'true');

            const browserUrl = new URL(riskManagerPage.url());
            expect(browserUrl.searchParams.get('source')).toBe('external-review');
            expect(browserUrl.searchParams.has('page')).toBe(false);
            expect(browserUrl.searchParams.get('view')).toBe(view);

            if (view === 'criticality') {
                const criticalityGroups = riskManagerPage.getByTestId('register-group-card');
                await expect(criticalityGroups.first()).toBeVisible();
                await expect(criticalityGroups.first()).not.toContainText('criticality:');
                await expect(criticalityGroups.first()).toContainText(/Low|Medium|High|Critical|Nízká|Střední|Vysoká|Kritická/);
            }
        }

        await Promise.all([
            waitForProcessList(riskManagerPage, (url) => url.searchParams.get('group_by') === 'department'),
            riskManagerPage.getByTestId('processes-view-department').click(),
        ]);
        const firstGroup = riskManagerPage.getByTestId('register-group-card').first();
        await expect(firstGroup).toBeVisible();
        const groupValue = await firstGroup.getAttribute('data-group-value');
        expect(groupValue).toBeTruthy();

        await Promise.all([
            waitForProcessList(riskManagerPage, (url) => url.searchParams.get('group_value') === groupValue),
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
        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('source') === 'external-review'
            && url.searchParams.get('group') === groupValue
        ));
        await waitForRegisterReady(riskManagerPage);
        await expect(riskManagerPage.locator('table')).toBeVisible();
    });

    test('search and two filter fields are URL-backed, ANDed by the server, and cleared together', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/processes?source=external-review&page=4');
        await waitForRegisterReady(riskManagerPage);

        const searchInput = riskManagerPage.getByTestId('processes-search-input');
        await searchInput.fill('E2E-PROC');
        await waitForProcessList(riskManagerPage, (url) => url.searchParams.get('search') === 'E2E-PROC');
        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('q') === 'E2E-PROC'
            && url.searchParams.get('source') === 'external-review'
            && !url.searchParams.has('page')
        ));

        await riskManagerPage.getByTestId('processes-add-filter').selectOption('criticality');
        const criticalityControl = riskManagerPage.getByTestId('processes-filter-control-criticality');
        await expect(criticalityControl).toBeVisible();
        const criticalityOption = criticalityControl.locator('input[type="checkbox"]:not(:disabled)').first();
        await expect(criticalityOption).toBeVisible();
        const criticalityRequestPromise = waitForProcessList(riskManagerPage, (url) => {
            const filters = JSON.parse(url.searchParams.get('filters') ?? '{}') as Record<string, unknown>;
            return Array.isArray(filters.criticality)
                && filters.criticality.length === 1
                && url.searchParams.get('source') === null
                && url.searchParams.getAll('lifecycle').join(',') === 'active';
        });
        await criticalityOption.check();
        const criticalityRequest = await criticalityRequestPromise;

        await riskManagerPage.getByTestId('processes-add-filter').selectOption('cif');
        const cifControl = riskManagerPage.getByTestId('processes-filter-control-cif');
        await expect(cifControl).toBeVisible();
        const combinedRequestPromise = waitForProcessList(riskManagerPage, (url) => {
            const filters = JSON.parse(url.searchParams.get('filters') ?? '{}') as Record<string, unknown>;
            return filters.cif === true
                && Array.isArray(filters.criticality)
                && filters.criticality.length === 1
                && url.searchParams.get('search') === 'E2E-PROC';
        });
        await cifControl.locator('select').selectOption('true');
        await combinedRequestPromise;

        expect(new URL(criticalityRequest.url()).searchParams.get('search')).toBe('E2E-PROC');
        await expect(riskManagerPage.getByTestId('processes-filter-chip-criticality')).toBeVisible();
        await expect(riskManagerPage.getByTestId('processes-filter-chip-cif')).toBeVisible();

        await riskManagerPage.getByTestId('processes-clear-filters').click();
        await expect(riskManagerPage.getByTestId('processes-filter-chip-criticality')).toHaveCount(0);
        await expect(riskManagerPage.getByTestId('processes-filter-chip-cif')).toHaveCount(0);
        await expect(searchInput).toHaveValue('E2E-PROC');
        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('q') === 'E2E-PROC'
            && url.searchParams.get('source') === 'external-review'
        ));
    });

    test('export uses the selected visible group but omits list pagination and carries code/label columns', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/processes?source=external-review&view=department&q=E2E-PROC');
        await waitForRegisterReady(riskManagerPage);
        const firstGroup = riskManagerPage.getByTestId('register-group-card').first();
        await expect(firstGroup).toBeVisible();
        const groupValue = await firstGroup.getAttribute('data-group-value');
        expect(groupValue).toBeTruthy();
        await Promise.all([
            waitForProcessList(riskManagerPage, (url) => url.searchParams.get('group_value') === groupValue),
            firstGroup.click(),
        ]);

        await riskManagerPage.getByTestId('processes-export-button').click();
        await expect(riskManagerPage.getByTestId('processes-export-dialog')).toBeVisible();

        const responsePromise = riskManagerPage.waitForResponse((response) => (
            response.request().method() === 'GET'
            && new URL(response.url()).pathname === '/api/v1/processes/export'
        ));
        await riskManagerPage.getByTestId('export-submit-button').click();
        const response = await responsePromise;
        expect(response.ok()).toBe(true);
        const exportUrl = new URL(response.url());
        expect(exportUrl.searchParams.has('offset')).toBe(false);
        expect(exportUrl.searchParams.has('limit')).toBe(false);
        expect(exportUrl.searchParams.get('search')).toBe('E2E-PROC');
        expect(exportUrl.searchParams.get('view')).toBe('department');
        expect(exportUrl.searchParams.get('group_by')).toBe('department');
        expect(exportUrl.searchParams.get('group_value')).toBe(groupValue);
        expect(['en', 'cs']).toContain(exportUrl.searchParams.get('locale'));
        expect(exportUrl.searchParams.get('source')).toBeNull();
        expect(exportUrl.searchParams.getAll('lifecycle')).toEqual(['active']);
        expect(new URL(riskManagerPage.url()).searchParams.get('source')).toBe('external-review');

        const csv = await response.text();
        expect(csv).toContain('criticality_code,criticality_label');
        expect(csv).toContain('licensed_activity_code,licensed_activity_label');
        await expect(riskManagerPage.getByTestId('processes-export-dialog')).not.toBeVisible();
    });

    test('failure offers an accessible retry and a server-declared access denial reveals no register data', async ({ riskManagerPage }) => {
        let forcedStatus: 500 | 403 | null = 500;
        await riskManagerPage.route('**/api/v1/processes?**', async (route) => {
            if (forcedStatus === null) {
                await route.continue();
                return;
            }
            await route.fulfill({
                status: forcedStatus,
                contentType: 'application/json',
                body: `{"detail":"synthetic #77 ${forcedStatus === 403 ? 'denial' : 'failure'}"}`,
            });
        });
        await riskManagerPage.goto('/processes');
        await expect(riskManagerPage.getByTestId('processes-register-shell')).toBeVisible();
        const retry = riskManagerPage.getByRole('button', { name: /Retry|Zkusit znovu/i });
        await expect(retry).toBeVisible();
        await retry.focus();
        forcedStatus = null;
        await Promise.all([
            waitForProcessList(riskManagerPage),
            riskManagerPage.keyboard.press('Enter'),
        ]);
        await expect(retry).toHaveCount(0);
        await expect(riskManagerPage.locator('table')).toBeVisible();

        forcedStatus = 403;
        await riskManagerPage.goto('/processes?access_probe=true');
        await expect(riskManagerPage.getByRole('heading', { name: /Access denied|Přístup odepřen/i })).toBeVisible();
        await expect(riskManagerPage.getByTestId('processes-register-shell')).toHaveCount(0);
        await expect(riskManagerPage.locator('table tbody tr')).toHaveCount(0);
        await expect(riskManagerPage.getByTestId('register-group-card')).toHaveCount(0);
    });
});
