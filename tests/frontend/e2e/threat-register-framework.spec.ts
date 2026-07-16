/**
 * Issue #79 — Threat migration onto the shared register shell.
 *
 * Backend tests own the exhaustive filter algebra and scope matrix. This
 * browser suite stays black-box: public URL state, stable controls, HTTP
 * requests, readable multi-membership, export, and accessible failure states.
 */
import type { Page, Request } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';
import { createThreatViaApi, getRiskByCode } from './helpers/ict-register';
import { getApiBaseUrl, getDemoToken } from './helpers/api-auth';

const THREAT_LIST_PATH = '/api/v1/threats';

function isThreatListRequest(request: Request): boolean {
    return request.method() === 'GET' && new URL(request.url()).pathname === THREAT_LIST_PATH;
}

function waitForThreatList(page: Page, predicate: (url: URL) => boolean = () => true) {
    return page.waitForRequest((request) => (
        isThreatListRequest(request) && predicate(new URL(request.url()))
    ));
}

async function waitForRegisterReady(page: Page): Promise<void> {
    await expect(page.getByTestId('threats-register-shell')).toBeVisible();
    await expect(page.getByTestId('sortable-table-skeleton')).toHaveCount(0, { timeout: 30_000 });
}

function requestFilters(url: URL): Record<string, unknown> {
    return JSON.parse(url.searchParams.get('filters') ?? '{}') as Record<string, unknown>;
}

async function addThreatRiskLink(threatId: number, riskId: number): Promise<void> {
    const token = await getDemoToken({
        email: 'risk.manager@riskhub.local',
        fallbackUserIds: [3],
    });
    const response = await fetch(`${getApiBaseUrl()}/api/v1/threats/${threatId}/risk-links`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ risk_id: riskId }),
    });
    if (!response.ok) {
        throw new Error(`Failed to link Threat ${threatId} to Risk ${riskId}: ${response.status} - ${await response.text()}`);
    }
}

async function cleanupThreatFixture(threatId: number | null): Promise<void> {
    if (threatId === null) {
        return;
    }

    const token = await getDemoToken({
        email: 'risk.manager@riskhub.local',
        fallbackUserIds: [3],
    });
    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
    const apiBase = getApiBaseUrl();
    const failures: string[] = [];

    try {
        const linksResponse = await fetch(`${apiBase}/api/v1/threats/${threatId}/risk-links`, { headers });
        if (linksResponse.ok) {
            const links = await linksResponse.json() as Array<{ id: number }>;
            for (const link of links) {
                try {
                    const response = await fetch(
                        `${apiBase}/api/v1/threats/${threatId}/risk-links/${link.id}`,
                        { method: 'DELETE', headers },
                    );
                    if (!response.ok && response.status !== 404) {
                        failures.push(`risk-link ${link.id}: ${response.status}`);
                    }
                } catch (error) {
                    failures.push(`risk-link ${link.id}: ${String(error)}`);
                }
            }
        } else if (linksResponse.status !== 404) {
            failures.push(`risk-link listing: ${linksResponse.status}`);
        }
    } catch (error) {
        failures.push(`risk-link listing: ${String(error)}`);
    }

    try {
        const archiveResponse = await fetch(`${apiBase}/api/v1/threats/${threatId}`, {
            method: 'DELETE',
            headers,
        });
        if (!archiveResponse.ok && archiveResponse.status !== 404) {
            failures.push(`Threat archive: ${archiveResponse.status}`);
        }
    } catch (error) {
        failures.push(`Threat archive: ${String(error)}`);
    }

    if (failures.length > 0) {
        throw new Error(`Failed to clean up Threat ${threatId}: ${failures.join('; ')}`);
    }
}

test.describe('ICT Register — shared Threat register framework (#79)', () => {
    test('five keyboard-operable views preserve unrelated URL state and restore a grouped drill-down', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/threats?source=external-review&page=9');
        await waitForRegisterReady(riskManagerPage);

        const viewContracts = [
            ['all', null],
            ['category', 'category'],
            ['threat_steward', 'threat_steward'],
            ['relevant_subject', 'relevant_subject'],
            ['linked_risk', 'linked_risk'],
        ] as const;

        for (const [view, groupBy] of viewContracts) {
            const viewButton = riskManagerPage.getByTestId(`threats-view-${view}`);
            await expect(viewButton).not.toHaveAttribute('role', 'tab');
            if (view === 'all') {
                await expect(viewButton).toHaveAttribute('aria-pressed', 'true');
                continue;
            }

            await viewButton.focus();
            await Promise.all([
                waitForThreatList(riskManagerPage, (url) => (
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
            expect(browserUrl.searchParams.get('view')).toBe(view);
            expect(browserUrl.searchParams.has('page')).toBe(false);
        }

        await expect(riskManagerPage.getByTestId('threats-view-linked_risk')).toHaveAttribute('aria-pressed', 'true');
        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('view') === 'linked_risk'
            && url.searchParams.get('group_by') === 'linked_risk'
        ));
        const firstGroup = riskManagerPage.getByTestId('register-group-card').first();
        await expect(firstGroup).toBeVisible();
        const groupValue = await firstGroup.getAttribute('data-group-value');
        expect(groupValue).toBeTruthy();

        await Promise.all([
            waitForThreatList(riskManagerPage, (url) => url.searchParams.get('group_value') === groupValue),
            firstGroup.click(),
        ]);
        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('source') === 'external-review'
            && url.searchParams.get('view') === 'linked_risk'
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

    test('search and every Threat filter are URL-backed, page-resetting, chipped, and cleared', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/threats?source=external-review&page=4');
        await waitForRegisterReady(riskManagerPage);

        const searchInput = riskManagerPage.getByTestId('threats-search-input');
        await searchInput.fill('E2E-THREAT');
        await waitForThreatList(riskManagerPage, (url) => url.searchParams.get('search') === 'E2E-THREAT');
        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('q') === 'E2E-THREAT'
            && url.searchParams.get('source') === 'external-review'
            && !url.searchParams.has('page')
        ));

        await riskManagerPage.getByTestId('threats-status-filter-trigger').click();
        const lifecycleRequest = waitForThreatList(riskManagerPage, (url) => (
            url.searchParams.getAll('lifecycle').join(',') === 'active,archived'
            && url.searchParams.get('search') === 'E2E-THREAT'
        ));
        await riskManagerPage.getByTestId('threats-status-filter-option-all').click();
        await lifecycleRequest;
        await expect(riskManagerPage.getByTestId('threats-filter-chip-lifecycle')).toBeVisible();

        const arrayFilters = [
            'categories',
            'steward_ids',
            'relevant_subjects',
            'linked_risk_ids',
            'linked_risk_types',
            'linked_risk_department_ids',
        ] as const;

        for (const key of arrayFilters) {
            await riskManagerPage.getByTestId('threats-add-filter').selectOption(key);
            const control = riskManagerPage.getByTestId(`threats-filter-control-${key}`);
            await expect(control).toBeVisible();
            const option = control.locator('input[type="checkbox"]:not(:disabled)').first();
            await expect(option).toBeVisible();
            const requestPromise = waitForThreatList(riskManagerPage, (url) => {
                const value = requestFilters(url)[key];
                return Array.isArray(value)
                    && value.length === 1
                    && url.searchParams.get('search') === 'E2E-THREAT'
                    && url.searchParams.get('source') === null;
            });
            await option.check();
            await requestPromise;
            await expect(riskManagerPage.getByTestId(`threats-filter-chip-${key}`)).toBeVisible();
        }

        await riskManagerPage.getByTestId('threats-add-filter').selectOption('has_linked_risk');
        const presenceControl = riskManagerPage.getByTestId('threats-filter-control-has_linked_risk');
        await expect(presenceControl).toBeVisible();
        const presenceRequest = waitForThreatList(riskManagerPage, (url) => (
            requestFilters(url).has_linked_risk === true
            && url.searchParams.get('search') === 'E2E-THREAT'
        ));
        await presenceControl.locator('select').selectOption('true');
        await presenceRequest;
        await expect(riskManagerPage.getByTestId('threats-filter-chip-has_linked_risk')).toBeVisible();

        await riskManagerPage.getByTestId('threats-clear-filters').click();
        for (const key of [...arrayFilters, 'has_linked_risk', 'lifecycle'] as const) {
            await expect(riskManagerPage.getByTestId(`threats-filter-chip-${key}`)).toHaveCount(0);
        }
        await expect(searchInput).toHaveValue('E2E-THREAT');
        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('q') === 'E2E-THREAT'
            && url.searchParams.get('source') === 'external-review'
            && !url.searchParams.has('page')
        ));
    });

    test('one Threat appears in every readable linked-Risk group without exposing a hidden Risk', async ({ employeePage }, testInfo) => {
        let threatId: number | null = null;
        try {
            const visibleRisk = await getRiskByCode('E2E-UW-003');
            const hiddenRisk = await getRiskByCode('XDEPT-002');
            if (!visibleRisk || !hiddenRisk) {
                throw new Error('Required Operations and Finance Risk fixtures are missing; reseed E2E data.');
            }
            const threat = await createThreatViaApi({
                name: `E2E-THREAT-MULTI ${testInfo.project.name} ${Date.now()}`,
                category: 'availability',
                description: 'Visible and hidden linked-Risk grouping probe.',
                typical_weaknesses: 'Scope leakage',
                relevant_subject: 'Shared register',
            });
            threatId = threat.id;
            await addThreatRiskLink(threat.id, visibleRisk.id);
            await addThreatRiskLink(threat.id, hiddenRisk.id);

            const firstResponsePromise = employeePage.waitForResponse((response) => (
                response.request().method() === 'GET'
                && new URL(response.url()).pathname === THREAT_LIST_PATH
                && new URL(response.url()).searchParams.get('group_by') === 'linked_risk'
                && new URL(response.url()).searchParams.get('search') === threat.name
                && !new URL(response.url()).searchParams.has('group_value')
            ));
            await employeePage.goto(`/threats?view=linked_risk&q=${encodeURIComponent(threat.name)}`);
            await waitForRegisterReady(employeePage);
            const firstResponse = await firstResponsePromise;
            const firstBody = await firstResponse.json() as {
                groups?: Array<{ value: string; label: string; count: number }>;
            };
            const groups = firstBody.groups ?? [];
            expect(groups).toEqual(expect.arrayContaining([
                expect.objectContaining({ value: `risk:${visibleRisk.id}`, count: 1 }),
            ]));
            expect(groups.some((group) => group.value === `risk:${hiddenRisk.id}`)).toBe(false);
            expect(JSON.stringify(groups)).not.toContain('XDEPT-002');
            expect(JSON.stringify(groups)).not.toContain(hiddenRisk.name);

            const visibleGroup = employeePage.getByTestId('register-group-card').filter({ hasText: 'E2E-UW-003' });
            await expect(visibleGroup).toBeVisible();
            await expect(employeePage.getByTestId('register-group-card').filter({ hasText: 'XDEPT-002' })).toHaveCount(0);

            const drillResponsePromise = employeePage.waitForResponse((response) => (
                response.request().method() === 'GET'
                && new URL(response.url()).pathname === THREAT_LIST_PATH
                && new URL(response.url()).searchParams.get('group_value') === `risk:${visibleRisk.id}`
            ));
            await visibleGroup.click();
            const drillResponse = await drillResponsePromise;
            const drillBody = await drillResponse.json() as {
                items?: Array<{ name: string; visible_linked_risk_count?: number }>;
            };
            expect(drillBody.items).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: threat.name, visible_linked_risk_count: 1 }),
            ]));
            await expect(employeePage.locator('tr', { hasText: threat.name })).toBeVisible();
        } finally {
            await cleanupThreatFixture(threatId);
        }
    });

    test('export carries current search, filters, and group but omits pagination', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/threats?source=external-review&view=category&q=E2E-THREAT');
        await waitForRegisterReady(riskManagerPage);
        const firstGroup = riskManagerPage.getByTestId('register-group-card').first();
        await expect(firstGroup).toBeVisible();
        const groupValue = await firstGroup.getAttribute('data-group-value');
        expect(groupValue).toBeTruthy();
        await Promise.all([
            waitForThreatList(riskManagerPage, (url) => url.searchParams.get('group_value') === groupValue),
            firstGroup.click(),
        ]);

        await riskManagerPage.getByTestId('threats-export-button').click();
        await expect(riskManagerPage.getByTestId('threats-export-dialog')).toBeVisible();
        const responsePromise = riskManagerPage.waitForResponse((response) => (
            response.request().method() === 'GET'
            && new URL(response.url()).pathname === '/api/v1/threats/export'
        ));
        await riskManagerPage.getByTestId('export-submit-button').click();
        const response = await responsePromise;
        expect(response.ok()).toBe(true);

        const exportUrl = new URL(response.url());
        expect(exportUrl.searchParams.has('offset')).toBe(false);
        expect(exportUrl.searchParams.has('limit')).toBe(false);
        expect(exportUrl.searchParams.get('search')).toBe('E2E-THREAT');
        expect(exportUrl.searchParams.get('view')).toBe('category');
        expect(exportUrl.searchParams.get('group_by')).toBe('category');
        expect(exportUrl.searchParams.get('group_value')).toBe(groupValue);
        expect(exportUrl.searchParams.get('source')).toBeNull();
        expect(exportUrl.searchParams.getAll('lifecycle')).toEqual(['active']);
        expect(['en', 'cs']).toContain(exportUrl.searchParams.get('locale'));

        const csv = await response.text();
        expect(csv).toContain('category_code,category_label');
        await expect(riskManagerPage.getByTestId('threats-export-dialog')).not.toBeVisible();
    });

    test('CISO receives the shared stewardship shell and backend-declared collection actions', async ({ cisoPage }) => {
        const responsePromise = cisoPage.waitForResponse((response) => (
            response.request().method() === 'GET'
            && new URL(response.url()).pathname === THREAT_LIST_PATH
        ));
        await cisoPage.goto('/threats');
        await waitForRegisterReady(cisoPage);
        const response = await responsePromise;
        const body = await response.json() as {
            capabilities?: { can_create?: boolean; can_export?: boolean };
        };
        await expect(cisoPage.getByTestId('threats-create-button')).toHaveCount(body.capabilities?.can_create ? 1 : 0);
        await expect(cisoPage.getByTestId('threats-export-button')).toHaveCount(body.capabilities?.can_export ? 1 : 0);
        await expect(cisoPage.getByTestId('threats-view-threat_steward')).toBeVisible();
        await expect(cisoPage.locator('nav a[href="/users"]')).toHaveCount(0);
        await expect(cisoPage.locator('nav a[href="/approvals"]')).toHaveCount(0);
    });

    test('failure offers keyboard retry and access denial removes stale register content', async ({ riskManagerPage }) => {
        let forcedStatus: 500 | 403 | null = 500;
        await riskManagerPage.route('**/api/v1/threats?**', async (route) => {
            if (forcedStatus === null) {
                await route.continue();
                return;
            }
            await route.fulfill({
                status: forcedStatus,
                contentType: 'application/json',
                body: `{"detail":"synthetic #79 ${forcedStatus === 403 ? 'denial' : 'failure'}"}`,
            });
        });
        await riskManagerPage.goto('/threats');
        await expect(riskManagerPage.getByTestId('threats-register-shell')).toBeVisible();
        const retry = riskManagerPage.getByRole('button', { name: /Retry|Zkusit znovu/i });
        await expect(retry).toBeVisible();
        await retry.focus();
        forcedStatus = null;
        await Promise.all([
            waitForThreatList(riskManagerPage),
            riskManagerPage.keyboard.press('Enter'),
        ]);
        await expect(retry).toHaveCount(0);
        await expect(riskManagerPage.locator('table')).toBeVisible();

        forcedStatus = 403;
        await riskManagerPage.goto('/threats?access_probe=true');
        await expect(riskManagerPage.getByRole('heading', { name: /Access denied|Přístup odepřen/i })).toBeVisible();
        await expect(riskManagerPage.getByTestId('threats-register-shell')).toHaveCount(0);
        await expect(riskManagerPage.locator('table tbody tr')).toHaveCount(0);
        await expect(riskManagerPage.getByTestId('register-group-card')).toHaveCount(0);
    });
});
