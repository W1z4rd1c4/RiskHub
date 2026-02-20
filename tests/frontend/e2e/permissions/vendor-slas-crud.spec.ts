import { test, expect } from '../fixtures/auth.fixture';
import { E2E_VENDOR_SLAS, E2E_VENDORS } from '../fixtures/e2e-data';
import { VendorDetailPage } from '../pages/VendorDetailPage';

const API_BASE = process.env.BACKEND_URL || 'http://localhost:8000';

async function getApiToken(): Promise<string> {
    const candidates: Array<{ url: string; body?: Record<string, string> }> = [
        { url: `${API_BASE}/api/v1/auth/demo-login`, body: { email: 'risk.manager@riskhub.local' } },
        { url: `${API_BASE}/api/v1/auth/demo-login/3` },
    ];

    for (const candidate of candidates) {
        const response = await fetch(candidate.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            ...(candidate.body ? { body: JSON.stringify(candidate.body) } : {}),
        });

        if (!response.ok) continue;
        const data = await response.json() as { access_token?: string };
        if (data.access_token) return data.access_token;
    }

    throw new Error('Failed to get API token using demo-login endpoints');
}

async function getVendorIdByRegistration(registrationId: string): Promise<number> {
    const token = await getApiToken();
    const params = new URLSearchParams({ search: registrationId, include_archived: 'true', limit: '50' });

    const response = await fetch(`${API_BASE}/api/v1/vendors?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to load vendor ${registrationId}: ${response.status}`);
    }

    const body = await response.json() as { items: Array<{ id: number; registration_id: string }> };
    const vendor = body.items.find((item) => item.registration_id === registrationId);
    if (!vendor) {
        throw new Error(`Vendor ${registrationId} not found`);
    }

    return vendor.id;
}

async function ensureVendorSlaArchived(
    vendorRegistrationId: string,
    metricName: string,
    archived: boolean,
): Promise<{ vendorId: number; slaId: number }> {
    const token = await getApiToken();
    const vendorId = await getVendorIdByRegistration(vendorRegistrationId);

    const listResponse = await fetch(
        `${API_BASE}/api/v1/vendor-slas?vendor_id=${vendorId}&include_archived=true`,
        { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!listResponse.ok) {
        throw new Error(`Failed to list SLAs for vendor ${vendorId}: ${listResponse.status}`);
    }

    const items = await listResponse.json() as Array<{ id: number; metric_name: string; is_archived: boolean }>;
    const sla = items.find((item) => item.metric_name === metricName);
    if (!sla) {
        throw new Error(`SLA '${metricName}' not found for vendor ${vendorRegistrationId}`);
    }

    if (sla.is_archived !== archived) {
        if (archived) {
            const archiveResponse = await fetch(`${API_BASE}/api/v1/vendor-slas/${sla.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!(archiveResponse.ok || archiveResponse.status === 204 || archiveResponse.status === 400)) {
                throw new Error(`Failed to archive SLA ${sla.id}: ${archiveResponse.status}`);
            }
        } else {
            const restoreResponse = await fetch(`${API_BASE}/api/v1/vendor-slas/${sla.id}/restore`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            });
            if (!(restoreResponse.ok || restoreResponse.status === 400)) {
                throw new Error(`Failed to restore SLA ${sla.id}: ${restoreResponse.status}`);
            }
        }
    }

    const finalArchived = await getVendorSlaArchivedState(vendorRegistrationId, metricName);
    if (finalArchived !== archived) {
        throw new Error(
            `SLA '${metricName}' expected archived=${archived} but got archived=${finalArchived}`
        );
    }

    return { vendorId, slaId: sla.id };
}

async function getVendorSlaArchivedState(
    vendorRegistrationId: string,
    metricName: string,
): Promise<boolean> {
    const token = await getApiToken();
    const vendorId = await getVendorIdByRegistration(vendorRegistrationId);
    const listResponse = await fetch(
        `${API_BASE}/api/v1/vendor-slas?vendor_id=${vendorId}&include_archived=true`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!listResponse.ok) {
        throw new Error(`Failed to list SLAs for vendor ${vendorId}: ${listResponse.status}`);
    }
    const items = await listResponse.json() as Array<{ metric_name: string; is_archived: boolean }>;
    const sla = items.find((item) => item.metric_name === metricName);
    if (!sla) {
        throw new Error(`SLA '${metricName}' not found for vendor ${vendorRegistrationId}`);
    }
    return sla.is_archived;
}

test.describe('Vendor SLA CRUD Permissions (Deterministic)', () => {
    test.describe.configure({ mode: 'serial' });

    let vendorId: number;

    test.beforeEach(async () => {
        const state = await ensureVendorSlaArchived(
            E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id,
            E2E_VENDOR_SLAS.ARCHIVED_RESTORE_TARGET.metric_name,
            true,
        );
        vendorId = state.vendorId;
    });

    test('Archived SLA is hidden by default and shown when include archived is enabled', async ({ riskManagerPage }) => {
        const vendorDetail = new VendorDetailPage(riskManagerPage);
        await vendorDetail.navigate(vendorId, 'sla');

        await expect(vendorDetail.slaCard(E2E_VENDOR_SLAS.ARCHIVED_RESTORE_TARGET.metric_name)).toHaveCount(0);

        await vendorDetail.setIncludeArchivedSla(true);
        await expect(vendorDetail.slaCard(E2E_VENDOR_SLAS.ARCHIVED_RESTORE_TARGET.metric_name)).toBeVisible();
    });

    test('Privileged user can restore archived SLA from vendor detail', async ({ riskManagerPage }) => {
        const vendorDetail = new VendorDetailPage(riskManagerPage);
        await vendorDetail.navigate(vendorId, 'sla');
        await vendorDetail.setIncludeArchivedSla(true);

        const targetCard = vendorDetail.slaCard(E2E_VENDOR_SLAS.ARCHIVED_RESTORE_TARGET.metric_name);
        await expect(targetCard).toBeVisible();
        await expect(targetCard.locator('button:has-text("Unarchive"), button:has-text("Obnov")').first()).toBeVisible();

        await vendorDetail.clickSlaUnarchive(E2E_VENDOR_SLAS.ARCHIVED_RESTORE_TARGET.metric_name);
        const isArchivedAfterRestore = await getVendorSlaArchivedState(
            E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id,
            E2E_VENDOR_SLAS.ARCHIVED_RESTORE_TARGET.metric_name,
        );
        expect(isArchivedAfterRestore).toBe(false);

        await ensureVendorSlaArchived(
            E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id,
            E2E_VENDOR_SLAS.ARCHIVED_RESTORE_TARGET.metric_name,
            true,
        );
    });

    test('Department-scoped user without vendors:delete cannot see SLA restore action', async ({ deptHeadPage }) => {
        const vendorDetail = new VendorDetailPage(deptHeadPage);
        await vendorDetail.navigate(vendorId, 'sla');
        await vendorDetail.setIncludeArchivedSla(true);

        const targetCard = vendorDetail.slaCard(E2E_VENDOR_SLAS.ARCHIVED_RESTORE_TARGET.metric_name);
        await expect(targetCard).toBeVisible();
        await expect(targetCard.locator('button:has-text("Unarchive"), button:has-text("Obnov")').first()).toHaveCount(0);
    });
});
