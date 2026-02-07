import { test, expect } from '../fixtures/auth.fixture';
import { E2E_VENDORS } from '../fixtures/e2e-data';
import { VendorsPage } from '../pages/VendorsPage';

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

async function getVendorByRegistration(registrationId: string): Promise<{ id: number; status: string } | null> {
    const token = await getApiToken();
    const params = new URLSearchParams({
        search: registrationId,
        include_archived: 'true',
        limit: '50',
    });

    const response = await fetch(`${API_BASE}/api/v1/vendors?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to load vendors for ${registrationId}: ${response.status}`);
    }

    const body = await response.json() as { items: Array<{ id: number; registration_id: string; status: string }> };
    const vendor = body.items.find((item) => item.registration_id === registrationId);
    return vendor ? { id: vendor.id, status: vendor.status } : null;
}

async function ensureVendorStatus(registrationId: string, status: 'active' | 'inactive'): Promise<number> {
    const vendor = await getVendorByRegistration(registrationId);
    if (!vendor) {
        throw new Error(`Vendor ${registrationId} not found`);
    }

    if (vendor.status === status) {
        return vendor.id;
    }

    const token = await getApiToken();
    if (status === 'inactive') {
        const archiveResponse = await fetch(`${API_BASE}/api/v1/vendors/${vendor.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!(archiveResponse.ok || archiveResponse.status === 204)) {
            throw new Error(`Failed to archive vendor ${vendor.id}: ${archiveResponse.status}`);
        }
    } else {
        const restoreResponse = await fetch(`${API_BASE}/api/v1/vendors/${vendor.id}/restore`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        if (!restoreResponse.ok) {
            throw new Error(`Failed to restore vendor ${vendor.id}: ${restoreResponse.status}`);
        }
    }

    return vendor.id;
}

test.describe('Vendor CRUD Permissions (Deterministic)', () => {
    test.beforeEach(async () => {
        await ensureVendorStatus(E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id, 'inactive');
    });

    test('Privileged user can restore inactive vendor from list', async ({ riskManagerPage }) => {
        const vendorsPage = new VendorsPage(riskManagerPage);
        await vendorsPage.navigate();
        await vendorsPage.setIncludeArchived(true);
        await vendorsPage.setStatusFilterInactive();
        await vendorsPage.search(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);

        const row = vendorsPage.rowByText(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);
        await expect(row).toBeVisible();
        await expect(row.locator('button:has-text("Unarchive"), button:has-text("Obnov")').first()).toBeVisible();

        await vendorsPage.clickUnarchiveForRow(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);

        const vendorAfterRestore = await getVendorByRegistration(E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id);
        expect(vendorAfterRestore?.status).toBe('active');

        await ensureVendorStatus(E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id, 'inactive');
    });

    test('Department-scoped user without delete permission cannot see restore action', async ({ deptHeadPage }) => {
        const vendorsPage = new VendorsPage(deptHeadPage);
        await vendorsPage.navigate();
        await vendorsPage.setIncludeArchived(true);
        await vendorsPage.setStatusFilterInactive();
        await vendorsPage.search(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);

        const row = vendorsPage.rowByText(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);
        await expect(row).toBeVisible();
        await expect(row.locator('button:has-text("Unarchive"), button:has-text("Obnov")').first()).toHaveCount(0);
    });
});
