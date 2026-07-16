/**
 * Issue #81 — migrate the mature Risk and Control registers without losing
 * their public behavior. Exhaustive filter algebra and authorization stay at
 * the API seam; this suite proves the shared shell through browser-visible
 * state and real HTTP requests.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page, Request } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';
import { E2E_CONTROLS, E2E_RISKS } from './fixtures/e2e-data';
import { WCAG_TAGS, toFindings } from './helpers/axeBaseline';

type RegisterContract = {
    collectionPath: '/api/v1/risks' | '/api/v1/controls';
    entity: 'Risk' | 'Control';
    exportPath: '/api/v1/risks/export' | '/api/v1/controls/export';
    fixtureName: string;
    archivedFixtureName: string;
    path: '/risks' | '/controls';
    prefix: 'risks' | 'controls';
    restoreTestIdPrefix: 'risk-unarchive-' | 'control-unarchive-';
    views: ReadonlyArray<readonly [string, string | null]>;
};

const REGISTERS: readonly RegisterContract[] = [
    {
        collectionPath: '/api/v1/risks',
        entity: 'Risk',
        exportPath: '/api/v1/risks/export',
        fixtureName: E2E_RISKS.ARCHIVE_ACTIVE_PAIR.name,
        archivedFixtureName: E2E_RISKS.ARCHIVE_RESTORE_TARGET.name,
        path: '/risks',
        prefix: 'risks',
        restoreTestIdPrefix: 'risk-unarchive-',
        views: [
            ['all', null],
            ['category', 'category'],
            ['department', 'department'],
            ['process', 'process'],
            ['risk_type', 'risk_type'],
            ['vendor', 'vendor'],
        ],
    },
    {
        collectionPath: '/api/v1/controls',
        entity: 'Control',
        exportPath: '/api/v1/controls/export',
        fixtureName: E2E_CONTROLS.ARCHIVE_ACTIVE_PAIR.name,
        archivedFixtureName: E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name,
        path: '/controls',
        prefix: 'controls',
        restoreTestIdPrefix: 'control-unarchive-',
        views: [
            ['all', null],
            ['category', 'category'],
            ['department', 'department'],
            ['process', 'process'],
            ['risk_type', 'risk_type'],
            ['risk', 'risk'],
            ['vendor', 'vendor'],
        ],
    },
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

async function waitForRegisterReady(page: Page, contract: RegisterContract): Promise<void> {
    await expect(page.getByTestId(`${contract.prefix}-register-shell`)).toBeVisible();
    await expect(page.getByTestId('sortable-table-skeleton')).toHaveCount(0, { timeout: 30_000 });
}

function requestFilter(url: URL, key: string): unknown {
    const direct = url.searchParams.get(key);
    if (direct !== null) return direct;
    const filters = JSON.parse(url.searchParams.get('filters') ?? '{}') as Record<string, unknown>;
    return filters[key];
}

test.describe('ICT Register — shared Risk and Control framework (#81)', () => {
    test('preserves every mature grouped view in URL state with keyboard and history support', async ({ riskManagerPage }) => {
        for (const contract of REGISTERS) {
            await riskManagerPage.goto(`${contract.path}?source=external-review&page=9`);
            await waitForRegisterReady(riskManagerPage, contract);

            for (const [view, groupBy] of contract.views) {
                const viewButton = riskManagerPage.getByTestId(`${contract.prefix}-view-${view}`);
                await expect(viewButton).not.toHaveAttribute('role', 'tab');
                if (view === 'all') {
                    await expect(viewButton).toHaveAttribute('aria-pressed', 'true');
                    continue;
                }
                await viewButton.focus();
                const [viewRequest] = await Promise.all([
                    waitForCollection(riskManagerPage, contract, (url) => (
                        url.searchParams.get('group_by') === groupBy
                        && url.searchParams.get('source') === null
                    )),
                    riskManagerPage.keyboard.press('Enter'),
                ]);
                expect(new URL(viewRequest.url()).searchParams.get('view')).toBeNull();
                await expect(viewButton).toHaveAttribute('aria-pressed', 'true');
                await expect(riskManagerPage).toHaveURL((url) => (
                    url.searchParams.get('source') === 'external-review'
                    && url.searchParams.get('view') === view
                    && !url.searchParams.has('page')
                ));
            }

            await Promise.all([
                waitForCollection(riskManagerPage, contract, (url) => url.searchParams.get('group_by') === 'department'),
                riskManagerPage.getByTestId(`${contract.prefix}-view-department`).click(),
            ]);
            const firstGroup = riskManagerPage.getByTestId('register-group-card').first();
            await expect(firstGroup).toBeVisible();
            const groupValue = await firstGroup.getAttribute('data-group-value');
            expect(groupValue).toBeTruthy();

            await Promise.all([
                waitForCollection(riskManagerPage, contract, (url) => url.searchParams.get('group_value') === groupValue),
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
            await waitForRegisterReady(riskManagerPage, contract);
            await expect(riskManagerPage.locator('table')).toBeVisible();
        }
    });

    test('keeps search while lifecycle cleanup resets page and preserves row capabilities', async ({ riskManagerPage }, testInfo) => {
        for (const contract of REGISTERS) {
            const listResponsePromise = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'GET'
                && new URL(response.url()).pathname === contract.collectionPath
            ));
            await riskManagerPage.goto(`${contract.path}?source=external-review&page=4`);
            await waitForRegisterReady(riskManagerPage, contract);
            const listBody = await (await listResponsePromise).json() as {
                capabilities?: { can_create?: boolean; can_export?: boolean };
            };
            await expect(riskManagerPage.getByTestId(`${contract.prefix}-create-button`))
                .toHaveCount(listBody.capabilities?.can_create ? 1 : 0);
            await expect(riskManagerPage.getByTestId(`${contract.prefix}-export-button`))
                .toHaveCount(listBody.capabilities?.can_export ? 1 : 0);

            const searchInput = riskManagerPage.getByTestId(`${contract.prefix}-search-input`);
            const [searchRequest] = await Promise.all([
                waitForCollection(riskManagerPage, contract, (url) => requestFilter(url, 'search') === contract.archivedFixtureName),
                searchInput.fill(contract.archivedFixtureName),
            ]);
            expect(new URL(searchRequest.url()).searchParams.has('filters')).toBe(true);
            await expect(riskManagerPage).toHaveURL((url) => (
                url.searchParams.get('q') === contract.archivedFixtureName
                && url.searchParams.get('source') === 'external-review'
                && !url.searchParams.has('page')
            ));

            await riskManagerPage.getByTestId(`${contract.prefix}-lifecycle-filter-trigger`).click();
            const [archiveRequest] = await Promise.all([
                waitForCollection(riskManagerPage, contract, (url) => requestFilter(url, 'lifecycle') === 'archived'),
                riskManagerPage.getByTestId(`${contract.prefix}-lifecycle-filter-option-archived`).click(),
            ]);
            expect(new URL(archiveRequest.url()).searchParams.has('filters')).toBe(true);
            expect(requestFilter(new URL(archiveRequest.url()), 'status')).not.toBe('archived');
            await expect(riskManagerPage.getByTestId(`${contract.prefix}-filter-chip-lifecycle`)).toBeVisible();
            const archivedRow = riskManagerPage.locator('tr', { hasText: contract.archivedFixtureName });
            await expect(archivedRow).toBeVisible({ timeout: 15_000 });
            await expect(archivedRow.locator(`[data-testid^="${contract.restoreTestIdPrefix}"]`).first()).toBeVisible();

            if (testInfo.project.name === 'ci') {
                const analysis = await new AxeBuilder({ page: riskManagerPage })
                    .withTags([...WCAG_TAGS])
                    .include('main')
                    .analyze();
                expect(
                    toFindings(analysis.violations),
                    `${contract.entity} archived filter state must be axe-clean`,
                ).toEqual([]);
            }

            await Promise.all([
                waitForCollection(riskManagerPage, contract, (url) => requestFilter(url, 'lifecycle') === 'active'),
                riskManagerPage.getByTestId(`${contract.prefix}-clear-filters`).click(),
            ]);
            await expect(riskManagerPage.getByTestId(`${contract.prefix}-filter-chip-lifecycle`)).toHaveCount(0);
            await expect(searchInput).toHaveValue(contract.archivedFixtureName);
            await expect(riskManagerPage).toHaveURL((url) => (
                url.searchParams.get('q') === contract.archivedFixtureName
                && url.searchParams.get('source') === 'external-review'
            ));
        }
    });

    test('exports every match in the selected group without list pagination', async ({ riskManagerPage }, testInfo) => {
        for (const contract of REGISTERS) {
            await riskManagerPage.goto(
                `${contract.path}?source=external-review&view=department&sort=name:desc&q=${encodeURIComponent(contract.fixtureName)}`,
            );
            await waitForRegisterReady(riskManagerPage, contract);
            const firstGroup = riskManagerPage.getByTestId('register-group-card').first();
            await expect(firstGroup).toBeVisible();
            const groupValue = await firstGroup.getAttribute('data-group-value');
            expect(groupValue).toBeTruthy();
            await Promise.all([
                waitForCollection(riskManagerPage, contract, (url) => url.searchParams.get('group_value') === groupValue),
                firstGroup.click(),
            ]);

            await riskManagerPage.getByTestId(`${contract.prefix}-export-button`).click();
            await expect(riskManagerPage.getByTestId(`${contract.prefix}-export-dialog`)).toBeVisible();
            await expect(riskManagerPage.getByTestId('export-purpose-current-view')).toBeChecked();
            await expect(riskManagerPage.getByTestId('export-purpose-point-in-time')).not.toBeChecked();
            await expect(riskManagerPage.getByTestId('export-date-input')).not.toBeVisible();

            if (testInfo.project.name === 'ci') {
                const currentViewAnalysis = await new AxeBuilder({ page: riskManagerPage })
                    .withTags([...WCAG_TAGS])
                    .include(`[data-testid="${contract.prefix}-export-dialog"]`)
                    .analyze();
                expect(
                    toFindings(currentViewAnalysis.violations),
                    `${contract.entity} current-view export mode must be axe-clean`,
                ).toEqual([]);
            }

            await riskManagerPage.getByTestId('export-purpose-point-in-time').check();
            await expect(riskManagerPage.getByTestId('export-date-input')).toBeVisible();
            if (testInfo.project.name === 'ci') {
                const pointInTimeAnalysis = await new AxeBuilder({ page: riskManagerPage })
                    .withTags([...WCAG_TAGS])
                    .include(`[data-testid="${contract.prefix}-export-dialog"]`)
                    .analyze();
                expect(
                    toFindings(pointInTimeAnalysis.violations),
                    `${contract.entity} point-in-time export mode must be axe-clean`,
                ).toEqual([]);
            }
            await riskManagerPage.getByTestId('export-purpose-current-view').check();
            await expect(riskManagerPage.getByTestId('export-date-input')).not.toBeVisible();

            const exportResponsePromise = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'GET'
                && new URL(response.url()).pathname === contract.exportPath
            ));
            await riskManagerPage.getByTestId('export-submit-button').click();
            const response = await exportResponsePromise;
            expect(response.ok()).toBe(true);
            const exportUrl = new URL(response.url());
            expect(exportUrl.searchParams.has('offset')).toBe(false);
            expect(exportUrl.searchParams.has('limit')).toBe(false);
            expect(exportUrl.searchParams.has('filters')).toBe(true);
            expect(requestFilter(exportUrl, 'search')).toBe(contract.fixtureName);
            expect(JSON.parse(exportUrl.searchParams.get('sort') ?? 'null')).toEqual({
                field: 'name',
                direction: 'desc',
            });
            expect(exportUrl.searchParams.get('view')).toBeNull();
            expect(exportUrl.searchParams.get('group_by')).toBe('department');
            expect(exportUrl.searchParams.get('group_value')).toBe(groupValue);
            expect(exportUrl.searchParams.get('source')).toBeNull();
            expect(exportUrl.searchParams.get('format')).toBe('csv');
            expect(['en', 'cs']).toContain(exportUrl.searchParams.get('locale'));
            await expect(riskManagerPage.getByTestId(`${contract.prefix}-export-dialog`)).not.toBeVisible();
            expect(new URL(riskManagerPage.url()).searchParams.get('source')).toBe('external-review');
        }
    });
});
