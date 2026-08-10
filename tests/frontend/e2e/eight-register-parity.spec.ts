/**
 * Issue #83 — black-box parity contract across all eight operational registers.
 *
 * Domain-specific filters, groups, scope/non-leakage, lifecycle actions, and
 * exports stay in the six focused framework suites. This matrix guards the
 * browser contract that must remain identical when legacy orchestration is
 * removed: shell/async readiness, server capabilities, URL-backed search,
 * page reset, and Back/Forward restoration of a grouped view.
 */
import type { Page, Request } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';

type RegisterContract = {
    collectionPath: string;
    groupedView: string;
    groupBy: string;
    path: string;
    prefix: string;
};

const REGISTERS: readonly RegisterContract[] = [
    { collectionPath: '/api/v1/processes', groupedView: 'department', groupBy: 'department', path: '/processes', prefix: 'processes' },
    { collectionPath: '/api/v1/assets', groupedView: 'department', groupBy: 'department', path: '/assets', prefix: 'assets' },
    { collectionPath: '/api/v1/threats', groupedView: 'category', groupBy: 'category', path: '/threats', prefix: 'threats' },
    { collectionPath: '/api/v1/vendors', groupedView: 'department', groupBy: 'department', path: '/vendors', prefix: 'vendors' },
    { collectionPath: '/api/v1/risks', groupedView: 'department', groupBy: 'department', path: '/risks', prefix: 'risks' },
    { collectionPath: '/api/v1/controls', groupedView: 'department', groupBy: 'department', path: '/controls', prefix: 'controls' },
    { collectionPath: '/api/v1/kris', groupedView: 'department', groupBy: 'department', path: '/kris', prefix: 'kris' },
    { collectionPath: '/api/v1/issues', groupedView: 'department', groupBy: 'department', path: '/issues', prefix: 'issues' },
] as const;

function isCollectionRequest(request: Request, contract: RegisterContract): boolean {
    return request.method() === 'GET' && new URL(request.url()).pathname === contract.collectionPath;
}

function waitForCollection(
    page: Page,
    contract: RegisterContract,
    predicate: (url: URL) => boolean = () => true,
) {
    return page.waitForRequest((request) => (
        isCollectionRequest(request, contract) && predicate(new URL(request.url()))
    ));
}

function requestSearch(url: URL): string | null {
    const directSearch = url.searchParams.get('search');
    if (directSearch !== null) return directSearch;
    const filters = JSON.parse(url.searchParams.get('filters') ?? '{}') as { search?: unknown };
    return typeof filters.search === 'string' ? filters.search : null;
}

async function waitForRegisterReady(page: Page, contract: RegisterContract): Promise<void> {
    await expect(page.getByTestId(`${contract.prefix}-register-shell`)).toBeVisible();
    await expect(page.getByTestId('sortable-table-skeleton')).toHaveCount(0, { timeout: 30_000 });
}

test.describe('ICT Register — eight-register parity contract (#83)', () => {
    for (const contract of REGISTERS) {
        test(`${contract.prefix} preserves the shared URL/history/capability contract`, async ({ riskManagerPage }) => {
            const initialResponsePromise = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'GET'
                && new URL(response.url()).pathname === contract.collectionPath
            ));
            await riskManagerPage.goto(`${contract.path}?source=external-review&page=7`);
            const initialResponse = await initialResponsePromise;
            expect(initialResponse.ok()).toBe(true);
            await waitForRegisterReady(riskManagerPage, contract);

            const body = await initialResponse.json() as {
                capabilities?: { can_create?: boolean; can_export?: boolean };
            };
            await expect(riskManagerPage.getByTestId(`${contract.prefix}-create-button`))
                .toHaveCount(body.capabilities?.can_create ? 1 : 0);
            await expect(riskManagerPage.getByTestId(`${contract.prefix}-export-button`))
                .toHaveCount(body.capabilities?.can_export ? 1 : 0);

            const search = `PARITY-${contract.prefix.toUpperCase()}`;
            const searchRequestPromise = waitForCollection(
                riskManagerPage,
                contract,
                (url) => requestSearch(url) === search,
            );
            await riskManagerPage.getByTestId(`${contract.prefix}-search-input`).fill(search);
            await searchRequestPromise;
            await expect(riskManagerPage).toHaveURL((url) => (
                url.searchParams.get('q') === search
                && url.searchParams.get('source') === 'external-review'
                && !url.searchParams.has('page')
            ));

            const groupedRequestPromise = waitForCollection(riskManagerPage, contract, (url) => (
                url.searchParams.get('group_by') === contract.groupBy
                && requestSearch(url) === search
            ));
            await riskManagerPage.getByTestId(`${contract.prefix}-view-${contract.groupedView}`).click();
            await groupedRequestPromise;
            await expect(riskManagerPage).toHaveURL((url) => (
                url.searchParams.get('view') === contract.groupedView
                && url.searchParams.get('q') === search
                && url.searchParams.get('source') === 'external-review'
                && !url.searchParams.has('page')
            ));

            await Promise.all([
                waitForCollection(riskManagerPage, contract, (url) => (
                    url.searchParams.get('group_by') === null && requestSearch(url) === search
                )),
                riskManagerPage.goBack(),
            ]);
            await expect(riskManagerPage).toHaveURL((url) => (
                !url.searchParams.has('view')
                && url.searchParams.get('q') === search
                && url.searchParams.get('source') === 'external-review'
            ));

            await Promise.all([
                waitForCollection(riskManagerPage, contract, (url) => (
                    url.searchParams.get('group_by') === contract.groupBy && requestSearch(url) === search
                )),
                riskManagerPage.goForward(),
            ]);
            await expect(riskManagerPage).toHaveURL((url) => (
                url.searchParams.get('view') === contract.groupedView
                && url.searchParams.get('q') === search
                && url.searchParams.get('source') === 'external-review'
            ));
        });
    }
});
