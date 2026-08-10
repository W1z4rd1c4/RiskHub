/**
 * Issue #80 — Vendor migration onto the shared register shell.
 *
 * Backend tests own the exhaustive filter/scope matrix. This browser contract
 * stays black-box: public URL state, stable controls, permission-scoped groups,
 * filtered export, record-owner capabilities, cleanup, and accessible async
 * states.
 */
import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import type { Page, Request } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';
import { E2E_ICT_VENDOR, E2E_VENDORS } from './fixtures/e2e-data';
import {
    ensureVendorArchived,
    getApiBaseUrl,
    getDemoToken,
    getVendorByRegistration,
} from './helpers/api-auth';
import { WCAG_TAGS, toFindings } from './helpers/axeBaseline';
import { getRiskByCode } from './helpers/ict-register';

const VENDOR_LIST_PATH = '/api/v1/vendors';

function isVendorListRequest(request: Request): boolean {
    return request.method() === 'GET' && new URL(request.url()).pathname === VENDOR_LIST_PATH;
}

function waitForVendorList(page: Page, predicate: (url: URL) => boolean = () => true) {
    return page.waitForResponse((response) => (
        isVendorListRequest(response.request()) && predicate(new URL(response.url()))
    ));
}

async function waitForRegisterReady(page: Page): Promise<void> {
    await expect(page.getByTestId('vendors-register-shell')).toBeVisible();
    await expect(page.getByTestId('sortable-table-skeleton')).toHaveCount(0, { timeout: 30_000 });
}

function requestFilters(url: URL): Record<string, unknown> {
    return JSON.parse(url.searchParams.get('filters') ?? '{}') as Record<string, unknown>;
}

async function riskManagerHeaders(): Promise<Record<string, string>> {
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}

async function resolveQueuedVendorMutation(response: globalThis.Response, reason: string): Promise<void> {
    if (response.status !== 202) {
        if (!response.ok) {
            throw new Error(`Vendor fixture mutation failed: ${response.status} ${await response.text()}`);
        }
        return;
    }
    const queued = await response.json() as { approval_id: number };
    const token = await getDemoToken({ email: 'cro@riskhub.local', fallbackUserIds: [2] });
    const approved = await fetch(`${getApiBaseUrl()}/api/v1/approvals/${queued.approval_id}/approve`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resolution_notes: `Approve ${reason}` }),
    });
    if (!approved.ok) {
        throw new Error(`Failed to approve Vendor fixture mutation: ${approved.status} ${await approved.text()}`);
    }
}

async function lookupVendorOwnerId(email: string): Promise<number> {
    const headers = await riskManagerHeaders();
    const params = new URLSearchParams({ q: email, limit: '50' });
    const response = await fetch(`${getApiBaseUrl()}/api/v1/users/lookup/vendor-owners?${params}`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to resolve Vendor owner ${email}: ${response.status}`);
    }
    const owners = await response.json() as Array<{ id: number; email: string }>;
    const owner = owners.find((candidate) => candidate.email === email);
    if (!owner) {
        throw new Error(`Active Vendor owner ${email} was not returned by the assignment lookup`);
    }
    return owner.id;
}

async function setVendorOwner(vendorId: number, ownerId: number): Promise<void> {
    const headers = await riskManagerHeaders();
    const reason = `Set Vendor ${vendorId} owner for register scope verification`;
    const response = await fetch(`${getApiBaseUrl()}/api/v1/vendors/${vendorId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
            outsourcing_owner_user_id: ownerId,
            request_reason: reason,
        }),
    });
    await resolveQueuedVendorMutation(response, reason);
}

async function ensureVendorRiskLink(vendorId: number, riskId: number): Promise<boolean> {
    const headers = await riskManagerHeaders();
    const apiBase = getApiBaseUrl();
    const currentResponse = await fetch(`${apiBase}/api/v1/vendors/${vendorId}/linked-risks`, { headers });
    if (!currentResponse.ok) {
        throw new Error(`Failed to list Vendor ${vendorId} Risk links: ${currentResponse.status}`);
    }
    const current = await currentResponse.json() as Array<{ id: number }>;
    if (current.some((risk) => risk.id === riskId)) {
        return false;
    }
    const response = await fetch(`${apiBase}/api/v1/vendors/${vendorId}/linked-risks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            risk_id: riskId,
            request_reason: `Link Vendor ${vendorId} to Risk ${riskId} for register grouping verification`,
        }),
    });
    await resolveQueuedVendorMutation(
        response,
        `Link Vendor ${vendorId} to Risk ${riskId} for register grouping verification`,
    );
    return true;
}

async function cleanupVendorRiskLinks(vendorId: number, riskIds: number[]): Promise<void> {
    const headers = await riskManagerHeaders();
    const failures: string[] = [];
    for (const riskId of riskIds) {
        try {
            const reason = `Remove Vendor ${vendorId} Risk ${riskId} after register grouping verification`;
            const response = await fetch(`${getApiBaseUrl()}/api/v1/vendors/${vendorId}/linked-risks/${riskId}`, {
                method: 'DELETE',
                headers,
                body: JSON.stringify({ request_reason: reason }),
            });
            if (response.status !== 404) {
                await resolveQueuedVendorMutation(response, reason);
            }
        } catch (error) {
            failures.push(`${riskId}: ${String(error)}`);
        }
    }
    if (failures.length > 0) {
        throw new Error(`Failed to restore Vendor ${vendorId} Risk links: ${failures.join('; ')}`);
    }
}

async function selectArrayFilter(page: Page, key: string): Promise<Request> {
    await page.getByTestId('vendors-add-filter').selectOption(key);
    const control = page.getByTestId(`vendors-filter-control-${key}`);
    await expect(control).toBeVisible();
    const option = control.locator('input[type="checkbox"]:not(:disabled)').first();
    await expect(option).toBeVisible();
    const request = waitForVendorList(page, (url) => {
        const value = requestFilters(url)[key];
        return Array.isArray(value) && value.length > 0;
    });
    await option.click();
    const completedRequest = await request;
    await expect(page.getByTestId(`vendors-filter-chip-${key}`)).toBeVisible();
    return completedRequest;
}

async function selectBooleanFilter(page: Page, key: string): Promise<Request> {
    await page.getByTestId('vendors-add-filter').selectOption(key);
    const request = waitForVendorList(page, (url) => requestFilters(url)[key] === true);
    await page.getByTestId(`vendors-filter-${key}-select`).selectOption('true');
    const completedRequest = await request;
    await expect(page.getByTestId(`vendors-filter-chip-${key}`)).toBeVisible();
    return completedRequest;
}

test.describe('ICT Register — shared Vendor register framework (#80)', () => {
    test('six keyboard-operable views preserve URL state and restore a grouped drill-down', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/vendors?source=external-review&page=9');
        await waitForRegisterReady(riskManagerPage);

        const viewContracts = [
            ['all', null],
            ['department', 'department'],
            ['process', 'process'],
            ['type', 'type'],
            ['risk', 'risk'],
            ['flag', 'flag'],
        ] as const;

        for (const [view, groupBy] of viewContracts) {
            const viewButton = riskManagerPage.getByTestId(`vendors-view-${view}`);
            await expect(viewButton).not.toHaveAttribute('role', 'tab');
            if (view === 'all') {
                await expect(viewButton).toHaveAttribute('aria-pressed', 'true');
                continue;
            }
            await viewButton.focus();
            await Promise.all([
                waitForVendorList(riskManagerPage, (url) => (
                    url.searchParams.get('view') === view
                    && url.searchParams.get('group_by') === groupBy
                    && url.searchParams.get('source') === null
                    && url.searchParams.getAll('lifecycle').join(',') === 'active'
                )),
                riskManagerPage.keyboard.press('Enter'),
            ]);
            await expect(viewButton).toHaveAttribute('aria-pressed', 'true');
            await expect(riskManagerPage).toHaveURL((url) => (
                url.searchParams.get('source') === 'external-review'
                && url.searchParams.get('view') === view
                && !url.searchParams.has('page')
            ));
        }

        const firstGroup = riskManagerPage.getByTestId('register-group-card').first();
        await expect(firstGroup).toBeVisible();
        const groupValue = await firstGroup.getAttribute('data-group-value');
        expect(groupValue).toBeTruthy();
        await Promise.all([
            waitForVendorList(riskManagerPage, (url) => url.searchParams.get('group_value') === groupValue),
            firstGroup.click(),
        ]);
        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('source') === 'external-review'
            && url.searchParams.get('view') === 'flag'
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

    test('search and representative remote, facet, boolean, lifecycle, and linked filters compose and reset page', async ({ riskManagerPage }, testInfo) => {
        const vendor = await getVendorByRegistration(E2E_VENDORS.ACTIVE_SECONDARY.registration_id);
        const risk = await getRiskByCode('E2E-IT-001');
        if (!vendor || !risk) throw new Error('Required Vendor and Risk fixtures are missing; reseed E2E data.');
        const createdLink = await ensureVendorRiskLink(vendor.id, risk.id);
        try {
            await riskManagerPage.goto('/vendors?source=external-review&page=4');
            await waitForRegisterReady(riskManagerPage);

        const searchInput = riskManagerPage.getByTestId('vendors-search-input');
        await Promise.all([
            waitForVendorList(riskManagerPage, (url) => url.searchParams.get('search') === 'E2E-VENDOR'),
            searchInput.fill('E2E-VENDOR'),
        ]);

        await riskManagerPage.getByTestId('vendors-status-filter-trigger').click();
        const lifecycleRequest = waitForVendorList(riskManagerPage, (url) => (
            url.searchParams.getAll('lifecycle').join(',') === 'active,archived'
            && url.searchParams.get('search') === 'E2E-VENDOR'
        ));
        await riskManagerPage.getByTestId('vendors-status-filter-option-all').click();
        await lifecycleRequest;
        await expect(riskManagerPage.getByTestId('vendors-filter-chip-lifecycle')).toBeVisible();

        await selectArrayFilter(riskManagerPage, 'department_ids');
        await selectArrayFilter(riskManagerPage, 'vendor_types');
        await selectArrayFilter(riskManagerPage, 'tiers');
        await selectArrayFilter(riskManagerPage, 'linked_risk_ids');
        await selectBooleanFilter(riskManagerPage, 'dora_relevant');
        const finalRequest = await selectBooleanFilter(riskManagerPage, 'has_roi_contract');
        const finalUrl = new URL(finalRequest.url());
        const finalFilters = requestFilters(finalUrl);
        expect(finalUrl.searchParams.get('search')).toBe('E2E-VENDOR');
        expect(finalFilters.department_ids).toEqual(expect.arrayContaining([expect.any(Number)]));
        expect(finalFilters.vendor_types).toEqual(expect.arrayContaining([expect.any(String)]));
        expect(finalFilters.tiers).toEqual(expect.arrayContaining([expect.any(String)]));
        expect(finalFilters.dora_relevant).toBe(true);
        expect(finalFilters.has_roi_contract).toBe(true);
        expect(finalFilters.linked_risk_ids).toEqual(expect.arrayContaining([expect.any(Number)]));
        expect(finalRequest.url()).toContain('filters=');

        await expect(riskManagerPage).toHaveURL((url) => (
            url.searchParams.get('q') === 'E2E-VENDOR'
            && url.searchParams.get('source') === 'external-review'
            && !url.searchParams.has('page')
        ));

        if (testInfo.project.name === 'ci') {
            const analysis = await new AxeBuilder({ page: riskManagerPage })
                .withTags([...WCAG_TAGS])
                .include('main')
                .analyze();
            expect(toFindings(analysis.violations), 'populated Vendor filter state must be axe-clean').toEqual([]);
        }

        const clearedRequest = waitForVendorList(riskManagerPage, (url) => {
            const filters = requestFilters(url);
            return url.searchParams.get('search') === 'E2E-VENDOR'
                && url.searchParams.getAll('lifecycle').join(',') === 'active'
                && !('department_ids' in filters)
                && !('vendor_types' in filters)
                && !('tiers' in filters)
                && !('dora_relevant' in filters)
                && !('has_roi_contract' in filters)
                && !('linked_risk_ids' in filters);
        });
        await riskManagerPage.getByTestId('vendors-clear-filters').click();
        await clearedRequest;
        for (const key of [
            'lifecycle',
            'department_ids',
            'vendor_types',
            'tiers',
            'dora_relevant',
            'has_roi_contract',
            'linked_risk_ids',
        ]) {
            await expect(riskManagerPage.getByTestId(`vendors-filter-chip-${key}`)).toHaveCount(0);
        }
            await expect(searchInput).toHaveValue('E2E-VENDOR');
        } finally {
            if (createdLink) await cleanupVendorRiskLinks(vendor.id, [risk.id]);
        }
    });

    test('By Risk repeats a Vendor across readable memberships without exposing a hidden Risk', async ({ employeePage }) => {
        const vendorId = await ensureVendorArchived(E2E_ICT_VENDOR.registration_id, false);
        const visibleRisks = await Promise.all([
            getRiskByCode('E2E-UW-001'),
            getRiskByCode('E2E-UW-003'),
        ]);
        const hiddenRisk = await getRiskByCode('XDEPT-002');
        if (visibleRisks.some((risk) => !risk) || !hiddenRisk) {
            throw new Error('Required Operations and Finance Risk fixtures are missing; reseed E2E data.');
        }
        const [firstVisibleRisk, secondVisibleRisk] = visibleRisks;
        if (!firstVisibleRisk || !secondVisibleRisk) throw new Error('Required Operations Risks are missing.');

        const createdLinks: number[] = [];
        try {
            if (await ensureVendorRiskLink(vendorId, firstVisibleRisk.id)) createdLinks.push(firstVisibleRisk.id);
            if (await ensureVendorRiskLink(vendorId, secondVisibleRisk.id)) createdLinks.push(secondVisibleRisk.id);
            if (await ensureVendorRiskLink(vendorId, hiddenRisk.id)) createdLinks.push(hiddenRisk.id);

            const responsePromise = employeePage.waitForResponse((response) => {
                const url = new URL(response.url());
                return response.request().method() === 'GET'
                    && url.pathname === VENDOR_LIST_PATH
                    && url.searchParams.get('group_by') === 'risk'
                    && url.searchParams.get('search') === E2E_ICT_VENDOR.name
                    && !url.searchParams.has('group_value');
            });
            await employeePage.goto(`/vendors?view=risk&q=${encodeURIComponent(E2E_ICT_VENDOR.name)}`);
            await waitForRegisterReady(employeePage);
            const body = await (await responsePromise).json() as {
                groups?: Array<{ value: string; label: string; count: number }>;
            };
            const groups = body.groups ?? [];
            expect(groups).toEqual(expect.arrayContaining([
                expect.objectContaining({ value: `risk:${firstVisibleRisk.id}`, count: 1 }),
                expect.objectContaining({ value: `risk:${secondVisibleRisk.id}`, count: 1 }),
            ]));
            expect(groups.some((group) => group.value === `risk:${hiddenRisk.id}`)).toBe(false);
            expect(JSON.stringify(groups)).not.toContain('XDEPT-002');
            expect(JSON.stringify(groups)).not.toContain(hiddenRisk.name);

            const visibleGroup = employeePage.getByTestId('register-group-card').filter({ hasText: 'E2E-UW-003' });
            await expect(employeePage.getByTestId('register-group-card').filter({ hasText: 'E2E-UW-001' })).toBeVisible();
            await expect(visibleGroup).toBeVisible();
            await expect(employeePage.getByTestId('register-group-card').filter({ hasText: 'XDEPT-002' })).toHaveCount(0);
            await Promise.all([
                waitForVendorList(employeePage, (url) => url.searchParams.get('group_value') === `risk:${secondVisibleRisk.id}`),
                visibleGroup.click(),
            ]);
            await expect(employeePage.locator('tr', { hasText: E2E_ICT_VENDOR.name })).toBeVisible();
        } finally {
            await cleanupVendorRiskLinks(vendorId, createdLinks);
        }
    });

    test('filtered export contains only the selected group and follows backend collection capabilities', async ({ riskManagerPage }) => {
        await Promise.all([
            ensureVendorArchived(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, false),
            ensureVendorArchived(E2E_VENDORS.ACTIVE_SECONDARY.registration_id, false),
        ]);
        const listResponse = riskManagerPage.waitForResponse((response) => (
            response.request().method() === 'GET' && new URL(response.url()).pathname === VENDOR_LIST_PATH
        ));
        await riskManagerPage.goto('/vendors?view=type&q=E2E-VENDOR');
        await waitForRegisterReady(riskManagerPage);
        const listBody = await (await listResponse).json() as {
            capabilities?: { can_create?: boolean; can_export?: boolean };
        };
        await expect(riskManagerPage.getByTestId('vendors-create-button')).toHaveCount(listBody.capabilities?.can_create ? 1 : 0);
        await expect(riskManagerPage.getByTestId('vendors-export-button')).toHaveCount(listBody.capabilities?.can_export ? 1 : 0);

        const groupValue = E2E_VENDORS.ACTIVE_PRIMARY.vendor_type;
        const group = riskManagerPage.locator(
            `[data-testid="register-group-card"][data-group-value="${groupValue}"]`,
        );
        await expect(group).toBeVisible();
        await Promise.all([
            waitForVendorList(riskManagerPage, (url) => url.searchParams.get('group_value') === groupValue),
            group.click(),
        ]);
        await expect(riskManagerPage.locator('tr', { hasText: E2E_VENDORS.ACTIVE_PRIMARY.name })).toBeVisible();
        await expect(riskManagerPage.locator('tr', { hasText: E2E_VENDORS.ACTIVE_SECONDARY.name })).toHaveCount(0);

        await riskManagerPage.getByTestId('vendors-export-button').click();
        await expect(riskManagerPage.getByTestId('vendors-export-dialog')).toBeVisible();
        const exportResponse = riskManagerPage.waitForResponse((response) => (
            response.request().method() === 'GET'
            && new URL(response.url()).pathname === '/api/v1/vendors/export'
        ));
        const downloadPromise = riskManagerPage.waitForEvent('download');
        await riskManagerPage.getByTestId('export-submit-button').click();
        const [response, download] = await Promise.all([exportResponse, downloadPromise]);
        expect(response.ok()).toBe(true);
        const url = new URL(response.url());
        expect(url.searchParams.has('offset')).toBe(false);
        expect(url.searchParams.has('limit')).toBe(false);
        expect(url.searchParams.get('search')).toBe('E2E-VENDOR');
        expect(url.searchParams.get('view')).toBe('type');
        expect(url.searchParams.get('group_by')).toBe('type');
        expect(url.searchParams.get('group_value')).toBe(groupValue);
        expect(url.searchParams.getAll('lifecycle')).toEqual(['active']);
        expect(['en', 'cs']).toContain(url.searchParams.get('locale'));
        const csv = await readFile(await download.path(), 'utf8');
        expect(csv).toContain('legal_name');
        expect(csv).toContain(E2E_VENDORS.ACTIVE_PRIMARY.registration_id);
        expect(csv).not.toContain(E2E_VENDORS.ACTIVE_SECONDARY.registration_id);
        await expect(riskManagerPage.getByTestId('vendors-export-dialog')).not.toBeVisible();
    });

    test('record-only platform owner receives one safe row without register-wide actions', async ({ adminPage }) => {
        const vendor = await getVendorByRegistration('E2E-VREG-006');
        if (!vendor) throw new Error('E2E-VREG-006 is missing; reseed deterministic Vendors.');
        const originalOwnerId = await lookupVendorOwnerId('fin.analyst@riskhub.local');
        const adminOwnerId = await lookupVendorOwnerId('admin@riskhub.local');

        await setVendorOwner(vendor.id, adminOwnerId);
        try {
            const responsePromise = adminPage.waitForResponse((response) => (
                response.request().method() === 'GET'
                && new URL(response.url()).pathname === VENDOR_LIST_PATH
                && new URL(response.url()).searchParams.get('search') === 'E2E-VENDOR-006'
            ));
            await adminPage.goto('/vendors?q=E2E-VENDOR-006');
            await waitForRegisterReady(adminPage);
            const body = await (await responsePromise).json() as {
                items: Array<{
                    id: number;
                    derived?: unknown;
                    capabilities?: { can_update?: boolean; can_archive?: boolean; can_restore?: boolean };
                }>;
                capabilities?: { can_create?: boolean; can_export?: boolean; can_view_risk_contexts?: boolean };
            };
            expect(body.items.map((item) => item.id)).toEqual([vendor.id]);
            expect(body.items[0]?.derived).toBeNull();
            expect(body.items[0]?.capabilities).toEqual(expect.objectContaining({
                can_update: true,
                can_archive: false,
                can_restore: false,
            }));
            expect(body.capabilities).toEqual(expect.objectContaining({
                can_create: false,
                can_export: false,
                can_view_risk_contexts: false,
            }));
            await expect(adminPage.getByTestId('vendors-create-button')).toHaveCount(0);
            await expect(adminPage.getByTestId('vendors-export-button')).toHaveCount(0);
            await expect(adminPage.getByTestId('vendors-view-risk')).toHaveCount(0);
        } finally {
            await setVendorOwner(vendor.id, originalOwnerId);
        }
    });

    test('failure supports keyboard retry and access denial clears stale register content', async ({ riskManagerPage }) => {
        let forcedStatus: 500 | 403 | null = 500;
        await riskManagerPage.route('**/api/v1/vendors?**', async (route) => {
            if (forcedStatus === null) {
                await route.continue();
                return;
            }
            await route.fulfill({
                status: forcedStatus,
                contentType: 'application/json',
                body: `{"detail":"synthetic #80 ${forcedStatus === 403 ? 'denial' : 'failure'}"}`,
            });
        });
        await riskManagerPage.goto('/vendors');
        await expect(riskManagerPage.getByTestId('vendors-register-shell')).toBeVisible();
        const retry = riskManagerPage.getByRole('button', { name: /Retry|Zkusit znovu/i });
        await expect(retry).toBeVisible();
        await retry.focus();
        forcedStatus = null;
        await Promise.all([
            waitForVendorList(riskManagerPage),
            riskManagerPage.keyboard.press('Enter'),
        ]);
        await expect(retry).toHaveCount(0);
        await expect(riskManagerPage.locator('table')).toBeVisible();

        forcedStatus = 403;
        await riskManagerPage.goto('/vendors?access_probe=true');
        await expect(riskManagerPage.getByRole('heading', { name: /Access denied|Přístup odepřen/i })).toBeVisible();
        await expect(riskManagerPage.getByTestId('vendors-register-shell')).toHaveCount(0);
        await expect(riskManagerPage.locator('table tbody tr')).toHaveCount(0);
        await expect(riskManagerPage.getByTestId('register-group-card')).toHaveCount(0);
    });
});
