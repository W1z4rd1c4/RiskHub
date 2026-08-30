/**
 * Issue #83 — black-box parity contract across all eight operational registers.
 *
 * Domain-specific filters, groups, scope/non-leakage, lifecycle actions, and
 * exports stay in the six focused framework suites. This matrix guards the
 * browser contract that must remain identical when legacy orchestration is
 * removed: shell/async readiness, server capabilities, URL-backed search,
 * page reset, and Back/Forward restoration of a grouped view.
 */
import type { Locator, Page, Request } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';

type RegisterContract = {
    backActionName: RegExp;
    collectionPath: string;
    groupedView: string;
    groupBy: string;
    path: string;
    prefix: string;
    sortField: string;
};

const REGISTERS: readonly RegisterContract[] = [
    {
        backActionName: /Back to Processes|Zpět na procesy/i,
        collectionPath: '/api/v1/processes',
        groupedView: 'department',
        groupBy: 'department',
        path: '/processes',
        prefix: 'processes',
        sortField: 'l1_process',
    },
    {
        backActionName: /Back to Assets|Zpět na aktiva/i,
        collectionPath: '/api/v1/assets',
        groupedView: 'department',
        groupBy: 'department',
        path: '/assets',
        prefix: 'assets',
        sortField: 'name',
    },
    {
        backActionName: /Back to Threats|Zpět na hrozby/i,
        collectionPath: '/api/v1/threats',
        groupedView: 'category',
        groupBy: 'category',
        path: '/threats',
        prefix: 'threats',
        sortField: 'name',
    },
    {
        backActionName: /Back to Register|Zpět do registru/i,
        collectionPath: '/api/v1/vendors',
        groupedView: 'department',
        groupBy: 'department',
        path: '/vendors',
        prefix: 'vendors',
        sortField: 'name',
    },
    {
        backActionName: /Back to Register|Zpět do registru/i,
        collectionPath: '/api/v1/risks',
        groupedView: 'department',
        groupBy: 'department',
        path: '/risks',
        prefix: 'risks',
        sortField: 'name',
    },
    {
        backActionName: /Back to Catalog|Zpět do katalogu/i,
        collectionPath: '/api/v1/controls',
        groupedView: 'department',
        groupBy: 'department',
        path: '/controls',
        prefix: 'controls',
        sortField: 'name',
    },
    {
        backActionName: /KRIs|KRI/i,
        collectionPath: '/api/v1/kris',
        groupedView: 'department',
        groupBy: 'department',
        path: '/kris',
        prefix: 'kris',
        sortField: 'metric_name',
    },
    {
        backActionName: /Back to Issues|Zpět na nálezy/i,
        collectionPath: '/api/v1/issues',
        groupedView: 'department',
        groupBy: 'department',
        path: '/issues',
        prefix: 'issues',
        sortField: 'title',
    },
] as const;

type CollectionResponseBody = {
    items?: Array<Record<string, unknown>>;
    total?: number;
};

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

async function installSecondPageFixture(page: Page, contract: RegisterContract): Promise<void> {
    let retainedItem: Record<string, unknown> | null = null;

    await page.route(`**${contract.collectionPath}?**`, async (route) => {
        const url = new URL(route.request().url());
        if (!url.searchParams.has('group_value')) {
            await route.continue();
            return;
        }

        const response = await route.fetch();
        const body = await response.json() as CollectionResponseBody;
        retainedItem = body.items?.[0] ?? retainedItem;
        const offset = Number(url.searchParams.get('offset') ?? '0');
        const items = offset === 10 && retainedItem ? [retainedItem] : body.items;

        await route.fulfill({
            response,
            json: {
                ...body,
                items,
                total: Math.max(body.total ?? 0, 11),
            },
        });
    });
}

function visibleBackAction(page: Page, contract: RegisterContract): Locator {
    return page.locator('main').getByRole('button', { name: contract.backActionName }).first();
}

function currentPath(page: Page): string {
    const url = new URL(page.url());
    return `${url.pathname}${url.search}${url.hash}`;
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
            expect(new URL(initialResponse.url()).searchParams.get('offset')).toBe('60');
            await expect(riskManagerPage).toHaveURL((url) => (
                url.searchParams.get('page') === '7'
                && url.searchParams.get('source') === 'external-review'
            ));

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

    for (const contract of REGISTERS) {
        test(`${contract.prefix} detail Back restores the exact grouped page working set`, async ({ riskManagerPage }) => {
            await riskManagerPage.setViewportSize({ width: 1440, height: 900 });
            await installSecondPageFixture(riskManagerPage, contract);

            await riskManagerPage.goto(
                `${contract.path}?source=external-review&view=${contract.groupedView}&sort=${contract.sortField}:desc`,
            );
            await waitForRegisterReady(riskManagerPage, contract);

            const firstGroup = riskManagerPage.getByTestId('register-group-card').first();
            await expect(firstGroup).toBeVisible();
            const groupValue = await firstGroup.getAttribute('data-group-value');
            expect(groupValue).toBeTruthy();

            await Promise.all([
                waitForCollection(riskManagerPage, contract, (url) => (
                    url.searchParams.get('group_value') === groupValue
                    && url.searchParams.get('offset') === '0'
                )),
                firstGroup.click(),
            ]);
            await expect(riskManagerPage.locator('tbody tr').first()).toBeVisible();

            await Promise.all([
                waitForCollection(riskManagerPage, contract, (url) => (
                    url.searchParams.get('group_value') === groupValue
                    && url.searchParams.get('offset') === '10'
                )),
                riskManagerPage.getByRole('button', { name: /Next|Další/i }).click(),
            ]);

            const returnPath = currentPath(riskManagerPage);
            const returnUrl = new URL(returnPath, 'http://riskhub.local');
            expect(returnUrl.pathname).toBe(contract.path);
            expect(returnUrl.searchParams.get('source')).toBe('external-review');
            expect(returnUrl.searchParams.get('view')).toBe(contract.groupedView);
            expect(returnUrl.searchParams.get('sort')).toBe(`${contract.sortField}:desc`);
            expect(returnUrl.searchParams.get('group')).toBe(groupValue);
            expect(returnUrl.searchParams.get('page')).toBe('2');

            const detailLink = riskManagerPage.locator('tbody tr').first()
                .getByRole('link', { name: /^(View|Zobrazit) /i })
                .first();
            await expect(detailLink).toBeVisible();
            const href = await detailLink.getAttribute('href');
            expect(href).toBeTruthy();
            expect(new URL(href!, 'http://riskhub.local').searchParams.get('return_to')).toBe(returnPath);

            await detailLink.click();
            await expect(riskManagerPage).toHaveURL((url) => (
                url.pathname.startsWith(`${contract.path}/`)
                && url.searchParams.get('return_to') === returnPath
            ));

            const backAction = visibleBackAction(riskManagerPage, contract);
            await expect(backAction).toBeVisible();
            await Promise.all([
                waitForCollection(riskManagerPage, contract, (url) => (
                    url.searchParams.get('group_value') === groupValue
                    && url.searchParams.get('offset') === '10'
                )),
                backAction.click(),
            ]);

            await expect(riskManagerPage).toHaveURL((url) => (
                `${url.pathname}${url.search}${url.hash}` === returnPath
            ));
            await waitForRegisterReady(riskManagerPage, contract);
            await expect(riskManagerPage.getByRole('button', { name: /Next|Další/i })).toBeDisabled();
            await expect(riskManagerPage.locator('tbody tr').first()).toBeVisible();
        });
    }
});
