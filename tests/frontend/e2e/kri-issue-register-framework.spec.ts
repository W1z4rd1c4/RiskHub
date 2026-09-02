/**
 * Issue #82 — KRI and Issue migration onto the shared register shell.
 *
 * Backend tests own exhaustive scope and filter semantics. These tests verify
 * browser-visible state, normalized HTTP requests, capabilities, evidence
 * modes, resilient async states, and accessibility through the public UI.
 */
import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import type { Page, Request } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';
import { E2E_KRIS } from './fixtures/e2e-data';
import { WCAG_TAGS, toFindings } from './helpers/axeBaseline';
import { KRIsPage } from './pages/KRIsPage';
import { IssuesPage } from './pages/IssuesPage';

type RegisterContract = {
    collectionPath: '/api/v1/kris' | '/api/v1/issues';
    currentExportPath: '/api/v1/kris/export' | '/api/v1/issues/export';
    historicalExportPath: '/api/v1/reports/kris/export' | '/api/v1/reports/issues/export';
    path: '/kris' | '/issues';
    prefix: 'kris' | 'issues';
    views: ReadonlyArray<readonly [string, string | null]>;
};

const REGISTERS: readonly RegisterContract[] = [
    {
        collectionPath: '/api/v1/kris',
        currentExportPath: '/api/v1/kris/export',
        historicalExportPath: '/api/v1/reports/kris/export',
        path: '/kris',
        prefix: 'kris',
        views: [
            ['all', null], ['category', 'category'], ['department', 'department'],
            ['process', 'process'], ['risk_type', 'risk_type'], ['risk', 'risk'], ['vendor', 'vendor'],
        ],
    },
    {
        collectionPath: '/api/v1/issues',
        currentExportPath: '/api/v1/issues/export',
        historicalExportPath: '/api/v1/reports/issues/export',
        path: '/issues',
        prefix: 'issues',
        views: [
            ['all', null], ['category', 'category'], ['department', 'department'], ['owner', 'owner'],
            ['process', 'process'], ['risk_type', 'risk_type'], ['severity', 'severity'],
            ['status', 'status'], ['type', 'type'], ['vendor', 'vendor'],
        ],
    },
] as const;

function isCollectionRequest(request: Request, contract: RegisterContract): boolean {
    return request.method() === 'GET' && new URL(request.url()).pathname === contract.collectionPath;
}

function waitForCollection(page: Page, contract: RegisterContract, predicate: (url: URL) => boolean = () => true) {
    return page.waitForResponse((response) => (
        isCollectionRequest(response.request(), contract) && predicate(new URL(response.url()))
    ));
}

async function waitForRegisterReady(page: Page, contract: RegisterContract): Promise<void> {
    await expect(page.getByTestId(`${contract.prefix}-register-shell`)).toBeVisible();
    await expect(page.getByTestId('sortable-table-skeleton')).toHaveCount(0, { timeout: 30_000 });
}

function filters(url: URL): Record<string, unknown> {
    return JSON.parse(url.searchParams.get('filters') ?? '{}') as Record<string, unknown>;
}

test.describe('ICT Register — shared KRI and Issue framework (#82)', () => {
    test('stable shell/view IDs preserve URL, group history, and local page reset', async ({ riskManagerPage }) => {
        for (const contract of REGISTERS) {
            await riskManagerPage.goto(`${contract.path}?source=external-review&page=7`);
            await waitForRegisterReady(riskManagerPage, contract);

            for (const [view, groupBy] of contract.views) {
                const button = riskManagerPage.getByTestId(`${contract.prefix}-view-${view}`);
                await expect(button).toBeVisible();
                await expect(button).not.toHaveAttribute('role', 'tab');
                if (view === 'all') continue;
                await button.focus();
                await Promise.all([
                    waitForCollection(riskManagerPage, contract, (url) => url.searchParams.get('group_by') === groupBy),
                    riskManagerPage.keyboard.press('Enter'),
                ]);
                await expect(button).toHaveAttribute('aria-pressed', 'true');
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
            const group = riskManagerPage.getByTestId('register-group-card').first();
            await expect(group).toBeVisible();
            const groupValue = await group.getAttribute('data-group-value');
            expect(groupValue).toBeTruthy();
            await Promise.all([
                waitForCollection(riskManagerPage, contract, (url) => url.searchParams.get('group_value') === groupValue),
                group.click(),
            ]);
            await expect(riskManagerPage).toHaveURL((url) => url.searchParams.get('group') === groupValue);
            await expect(riskManagerPage.locator('table')).toBeVisible();
            await riskManagerPage.goBack();
            await expect(riskManagerPage).toHaveURL((url) => !url.searchParams.has('group'));
            await riskManagerPage.goForward();
            await expect(riskManagerPage).toHaveURL((url) => url.searchParams.get('group') === groupValue);
        }
    });

    test('KRI lifecycle, monitoring, timeliness, breach and restore remain distinct', async ({ riskManagerPage }, testInfo) => {
        const page = new KRIsPage(riskManagerPage);
        await page.navigate('?source=external-review&page=5');

        let requestPromise = waitForCollection(riskManagerPage, REGISTERS[0], (url) => filters(url).monitoring_status === 'breach');
        await riskManagerPage.getByTestId('kris-status-filter-breach').click();
        let requestUrl = new URL((await requestPromise).url());
        expect(filters(requestUrl)).toMatchObject({ monitoring_status: 'breach' });
        await expect(riskManagerPage).toHaveURL((url) => !url.searchParams.has('page'));

        requestPromise = waitForCollection(riskManagerPage, REGISTERS[0], (url) => filters(url).timeliness_status === 'due_soon');
        await riskManagerPage.getByTestId('kris-status-filter-due_soon').click();
        requestUrl = new URL((await requestPromise).url());
        expect(filters(requestUrl).monitoring_status).toBeUndefined();

        await riskManagerPage.getByTestId('kris-add-filter').selectOption('breach_only');
        requestPromise = waitForCollection(riskManagerPage, REGISTERS[0], (url) => filters(url).breach_only === true);
        await riskManagerPage.getByRole('checkbox', { name: /Breached only|Pouze překročené/i }).click();
        await requestPromise;

        requestPromise = waitForCollection(riskManagerPage, REGISTERS[0], (url) => filters(url).lifecycle === 'archived');
        await riskManagerPage.getByTestId('kris-status-filter-archived').click();
        requestUrl = new URL((await requestPromise).url());
        expect(filters(requestUrl)).toMatchObject({ lifecycle: 'archived', is_archived: true });
        expect(filters(requestUrl).monitoring_status).toBeUndefined();
        expect(filters(requestUrl).timeliness_status).toBeUndefined();
        expect(filters(requestUrl).breach_only).toBeUndefined();

        const breachOnly = riskManagerPage.getByRole('checkbox', { name: /Breached only|Pouze překročené/i });
        requestPromise = waitForCollection(riskManagerPage, REGISTERS[0], (url) => (
            filters(url).lifecycle === 'active' && filters(url).breach_only === true
        ));
        await breachOnly.click();
        requestUrl = new URL((await requestPromise).url());
        expect(filters(requestUrl).is_archived).toBeUndefined();
        expect(filters(requestUrl).include_archived).toBeUndefined();

        await riskManagerPage.getByTestId('kris-lifecycle-filter-trigger').click();
        requestPromise = waitForCollection(riskManagerPage, REGISTERS[0], (url) => (
            filters(url).lifecycle === 'all' && filters(url).breach_only === undefined
        ));
        await riskManagerPage.getByTestId('kris-lifecycle-filter-option-all').click();
        await requestPromise;

        requestPromise = waitForCollection(riskManagerPage, REGISTERS[0], (url) => (
            filters(url).lifecycle === 'active' && filters(url).breach_only === true
        ));
        await breachOnly.click();
        await requestPromise;

        requestPromise = waitForCollection(riskManagerPage, REGISTERS[0], (url) => filters(url).lifecycle === 'archived');
        await riskManagerPage.getByTestId('kris-status-filter-archived').click();
        await requestPromise;

        await page.search(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);
        const archivedRow = page.rowByText(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);
        await expect(archivedRow).toBeVisible();
        const restore = archivedRow.locator('[data-testid^="kri-unarchive-"]').first();
        await expect(restore).toBeVisible();
        if (testInfo.project.name === 'ci') {
            const analysis = await new AxeBuilder({ page: riskManagerPage }).withTags([...WCAG_TAGS]).include('main').analyze();
            expect(toFindings(analysis.violations), 'KRI archived/filter state must be axe-clean').toEqual([]);
        }
        await riskManagerPage.route('**/api/v1/kris/*/restore', async (route) => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
        });
        await restore.click();
    });

    test('Issue status, severity, overdue, exception, remediation and closed filters compose', async ({ riskManagerPage }, testInfo) => {
        const page = new IssuesPage(riskManagerPage);
        const query = new URLSearchParams({
            source: 'external-review',
            page: '6',
            filters: JSON.stringify({ remediation_status: 'active' }),
        });
        await page.navigate(`?${query.toString()}`);

        let requestPromise = waitForCollection(riskManagerPage, REGISTERS[1], (url) => filters(url).include_closed === true);
        await riskManagerPage.getByRole('checkbox', { name: /Include closed|Včetně uzavřených/i }).click();
        await requestPromise;

        await riskManagerPage.getByTestId('issues-status-filter-trigger').click();
        requestPromise = waitForCollection(riskManagerPage, REGISTERS[1], (url) => (
            filters(url).status === 'closed' && filters(url).include_closed === true
        ));
        await riskManagerPage.getByTestId('issues-status-filter-option-closed').click();
        await requestPromise;

        await riskManagerPage.getByTestId('issues-severity-filter-trigger').click();
        requestPromise = waitForCollection(riskManagerPage, REGISTERS[1], (url) => filters(url).severity_group === 'high_critical');
        await riskManagerPage.getByTestId('issues-severity-filter-option-high_critical').click();
        await requestPromise;

        requestPromise = waitForCollection(riskManagerPage, REGISTERS[1], (url) => filters(url).overdue === true);
        await riskManagerPage.getByRole('checkbox', { name: /Overdue only|Pouze po termínu/i }).click();
        await requestPromise;
        requestPromise = waitForCollection(riskManagerPage, REGISTERS[1], (url) => filters(url).exclude_active_exceptions === true);
        await riskManagerPage.getByRole('checkbox', { name: /Exclude active exceptions|Vyloučit aktivní výjimky/i }).click();
        const finalUrl = new URL((await requestPromise).url());
        expect(filters(finalUrl)).toMatchObject({
            status: 'closed', severity_group: 'high_critical', include_closed: true,
            overdue: true, exclude_active_exceptions: true, remediation_status: 'active',
        });
        await expect(riskManagerPage).toHaveURL((url) => !url.searchParams.has('page'));

        if (testInfo.project.name === 'ci') {
            const analysis = await new AxeBuilder({ page: riskManagerPage }).withTags([...WCAG_TAGS]).include('main').analyze();
            expect(toFindings(analysis.violations), 'Issue populated filter state must be axe-clean').toEqual([]);
        }
    });

    test('selected zero-count Issue facets remain represented and removable without becoming selectable', async ({ riskManagerPage }) => {
        await riskManagerPage.route('**/api/v1/issues?**', async (route) => {
            const response = await route.fetch();
            const body = await response.json() as Record<string, unknown> & { facets?: Record<string, unknown> };
            await route.fulfill({
                response,
                json: {
                    ...body,
                    facets: {
                        ...(body.facets ?? {}),
                        status: [{ value: 'closed', label: 'closed', count: 0, selected: true, disabled: true }],
                        severity: [{ value: 'high_critical', label: 'high_critical', count: 0, selected: true, disabled: true }],
                    },
                },
            });
        });
        const query = new URLSearchParams({
            filters: JSON.stringify({ status: 'closed', severity_group: 'high_critical', include_closed: true }),
        });
        await riskManagerPage.goto(`/issues?${query.toString()}`);
        await waitForRegisterReady(riskManagerPage, REGISTERS[1]);

        await expect(riskManagerPage.getByTestId('issues-filter-chip-status')).toBeVisible();
        await expect(riskManagerPage.getByTestId('issues-filter-chip-severity')).toBeVisible();
        await riskManagerPage.getByTestId('issues-status-filter-trigger').click();
        await expect(riskManagerPage.getByTestId('issues-status-filter-option-closed')).toHaveAttribute('data-disabled');
        await riskManagerPage.keyboard.press('Escape');
        await riskManagerPage.getByTestId('issues-severity-filter-trigger').click();
        await expect(riskManagerPage.getByTestId('issues-severity-filter-option-high_critical')).toHaveAttribute('data-disabled');
        await riskManagerPage.keyboard.press('Escape');

        let requestPromise = waitForCollection(riskManagerPage, REGISTERS[1], (url) => (
            filters(url).status === undefined && filters(url).severity_group === 'high_critical'
        ));
        await riskManagerPage.getByTestId('issues-filter-chip-status').getByRole('button').click();
        await requestPromise;
        await expect(riskManagerPage.getByTestId('issues-filter-chip-status')).toHaveCount(0);

        requestPromise = waitForCollection(riskManagerPage, REGISTERS[1], (url) => (
            filters(url).severity_group === undefined && filters(url).include_closed === false
        ));
        await riskManagerPage.getByTestId('issues-clear-filters').click();
        await requestPromise;
        await expect(riskManagerPage.getByTestId('issues-filter-chip-severity')).toHaveCount(0);
    });

    test('capabilities govern actions and current export stays separate from historical evidence', async ({ riskManagerPage }, testInfo) => {
        for (const contract of REGISTERS) {
            const responsePromise = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'GET' && new URL(response.url()).pathname === contract.collectionPath
            ));
            await riskManagerPage.goto(`${contract.path}?view=department&sort=${contract.prefix === 'kris' ? 'metric_name' : 'title'}:desc`);
            await waitForRegisterReady(riskManagerPage, contract);
            const body = await (await responsePromise).json() as { capabilities?: { can_create?: boolean; can_export?: boolean } };
            await expect(riskManagerPage.getByTestId(`${contract.prefix}-create-button`)).toHaveCount(body.capabilities?.can_create ? 1 : 0);
            await expect(riskManagerPage.getByTestId(`${contract.prefix}-export-button`)).toHaveCount(body.capabilities?.can_export ? 1 : 0);
            if (!body.capabilities?.can_export) continue;

            await riskManagerPage.getByTestId(`${contract.prefix}-export-button`).click();
            const dialog = riskManagerPage.getByTestId(`${contract.prefix}-export-dialog`);
            await expect(dialog).toBeVisible();
            await expect(riskManagerPage.getByTestId('export-purpose-current-view')).toBeChecked();
            await expect(riskManagerPage.getByTestId('export-date-input')).not.toBeVisible();
            if (testInfo.project.name === 'ci') {
                const analysis = await new AxeBuilder({ page: riskManagerPage })
                    .withTags([...WCAG_TAGS]).include(`[data-testid="${contract.prefix}-export-dialog"]`).analyze();
                expect(toFindings(analysis.violations), `${contract.prefix} export dialog must be axe-clean`).toEqual([]);
            }
            const currentResponsePromise = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'GET' && new URL(response.url()).pathname === contract.currentExportPath
            ));
            const currentDownloadPromise = riskManagerPage.waitForEvent('download');
            await riskManagerPage.getByTestId('export-submit-button').click();
            const [currentResponse, currentDownload] = await Promise.all([
                currentResponsePromise,
                currentDownloadPromise,
            ]);
            expect(currentResponse.ok()).toBe(true);
            const currentUrl = new URL(currentResponse.url());
            expect(currentUrl.searchParams.has('offset')).toBe(false);
            expect(currentUrl.searchParams.has('limit')).toBe(false);
            expect(currentUrl.searchParams.has('sort')).toBe(true);
            expect(currentUrl.searchParams.get('group_by')).toBe('department');
            expect(['en', 'cs']).toContain(currentUrl.searchParams.get('locale'));
            const csv = await readFile(await currentDownload.path(), 'utf8');
            if (contract.prefix === 'kris') {
                expect(csv).toContain('monitoring_status_code');
                expect(csv).toContain('lifecycle_code');
            } else {
                expect(csv).toContain('remediation_status');
                expect(csv).toContain('exception_status');
                expect(csv).toContain('linked_risk_ids');
            }

            await riskManagerPage.getByTestId(`${contract.prefix}-export-button`).click();
            const datedPurposeTestId = contract.prefix === 'issues'
                ? 'export-purpose-evaluation'
                : 'export-purpose-point-in-time';
            await riskManagerPage.getByTestId(datedPurposeTestId).check();
            await expect(riskManagerPage.getByTestId('export-date-input')).toBeVisible();
            const historicalResponsePromise = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'GET' && new URL(response.url()).pathname === contract.historicalExportPath
            ));
            await riskManagerPage.getByTestId('export-submit-button').click();
            const historicalResponse = await historicalResponsePromise;
            expect(historicalResponse.ok()).toBe(true);
            expect(new URL(historicalResponse.url()).searchParams.has('as_of_date')).toBe(true);
        }
    });

    test('stale rows survive retryable errors while access denial clears the register', async ({ riskManagerPage }) => {
        for (const contract of REGISTERS) {
            let forcedStatus: 500 | 403 | null = null;
            await riskManagerPage.route(`**${contract.collectionPath}?**`, async (route) => {
                if (forcedStatus === null) {
                    await route.continue();
                    return;
                }
                await route.fulfill({
                    status: forcedStatus,
                    contentType: 'application/json',
                    body: JSON.stringify({ detail: `synthetic #82 ${forcedStatus}` }),
                });
            });
            await riskManagerPage.getByRole('link', {
                name: contract.prefix === 'kris' ? /^KRIs$/ : /^Issues$/,
            }).click();
            await riskManagerPage.waitForURL(contract.path);
            await waitForRegisterReady(riskManagerPage, contract);
            const priorRows = await riskManagerPage.locator('table tbody tr').count();

            forcedStatus = 500;
            await riskManagerPage.getByTestId(`${contract.prefix}-refresh-button`).click();
            const retry = riskManagerPage.getByRole('button', { name: /Retry|Zkusit znovu/i });
            await expect(retry).toBeVisible();
            if (priorRows > 0) await expect(riskManagerPage.locator('table tbody tr')).toHaveCount(priorRows);
            forcedStatus = null;
            await retry.focus();
            await Promise.all([waitForCollection(riskManagerPage, contract), riskManagerPage.keyboard.press('Enter')]);
            await expect(retry).toHaveCount(0);

            forcedStatus = 403;
            await riskManagerPage.getByTestId(`${contract.prefix}-refresh-button`).click();
            await expect(riskManagerPage.getByTestId(`${contract.prefix}-register-shell`)).toHaveCount(0);
            await expect(riskManagerPage.locator('table tbody tr')).toHaveCount(0);
            await expect(riskManagerPage.getByTestId('register-group-card')).toHaveCount(0);
            await riskManagerPage.unroute(`**${contract.collectionPath}?**`);
        }
    });
});
