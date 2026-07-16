import { test, expect } from './fixtures/auth.fixture';
import { E2E_KRIS, E2E_RISKS, E2E_VENDORS } from './fixtures/e2e-data';
import {
    ensureRiskStatus,
    ensureVendorArchived,
    getApiBaseUrl,
    getDemoToken,
    getKRIByMetricName,
    linkVendorToRisk,
    unlinkVendorFromKRI,
} from './helpers/api-auth';
import { waitForDataLoad } from './helpers/wait';
import { VendorsPage } from './pages/VendorsPage';

function todayLocalIso(): string {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

interface VendorOwnerFixture {
    id: number;
    email: string;
}

interface AdminUserFixture extends VendorOwnerFixture {
    is_active: boolean;
    name: string;
    role: { id: number };
    department_id: number | null;
}

async function apiJson<T>(
    path: string,
    token: string,
    init: RequestInit = {},
): Promise<T> {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...init.headers,
        },
    });
    if (!response.ok) {
        throw new Error(`${init.method ?? 'GET'} ${path} failed: ${response.status} ${await response.text()}`);
    }
    return await response.json() as T;
}

async function getVendorOwnerByEmail(email: string): Promise<VendorOwnerFixture> {
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    const owners = await apiJson<VendorOwnerFixture[]>(
        `/api/v1/users/lookup/vendor-owners?q=${encodeURIComponent(email)}&limit=50`,
        token,
    );
    const owner = owners.find((candidate) => candidate.email === email);
    if (!owner) throw new Error(`Active Vendor owner ${email} was not found`);
    return owner;
}

async function setVendorOwner(vendorId: number, ownerId: number): Promise<void> {
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    await apiJson(
        `/api/v1/vendors/${vendorId}`,
        token,
        { method: 'PATCH', body: JSON.stringify({ outsourcing_owner_user_id: ownerId }) },
    );
}

async function setUserActive(userId: number, isActive: boolean): Promise<void> {
    const token = await getDemoToken({ email: 'admin@riskhub.local', fallbackUserIds: [1] });
    await apiJson(
        `/api/v1/access/users/${userId}`,
        token,
        { method: 'PATCH', body: JSON.stringify({ is_active: isActive }) },
    );
}

async function ensureDedicatedVendorOwner(): Promise<AdminUserFixture> {
    const token = await getDemoToken({ email: 'admin@riskhub.local', fallbackUserIds: [1] });
    const users = await apiJson<AdminUserFixture[]>('/api/v1/users?skip=0&limit=1000', token);
    const email = 'e2e.vendor.orphan-owner@riskhub.local';
    let owner = users.find((user) => user.email === email);

    if (!owner) {
        const template = users.find((user) => user.email === 'it.analyst@riskhub.local');
        if (!template) throw new Error('IT Analyst template user was not found');
        owner = await apiJson<AdminUserFixture>('/api/v1/users', token, {
            method: 'POST',
            body: JSON.stringify({
                email,
                name: 'E2E Vendor Former Owner',
                password: 'RiskHub-E2E-Vendor-Owner-2026!',
                role_id: template.role.id,
                department_id: template.department_id,
                is_active: true,
            }),
        });
    } else if (!owner.is_active) {
        await setUserActive(owner.id, true);
        owner = { ...owner, is_active: true };
    }

    return owner;
}

async function restoreVendorOwnerBaseline(vendorId: number, ownerId: number): Promise<void> {
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    const overview = await apiJson<{
        items: Array<{ id: number; item_id: number; item_type: string }>;
    }>('/api/v1/orphaned-items/overview?status=pending', token);
    const orphan = overview.items.find((item) => item.item_type === 'vendor' && item.item_id === vendorId);
    if (orphan) {
        await apiJson(
            `/api/v1/orphaned-items/${orphan.id}/resolve`,
            token,
            { method: 'POST', body: JSON.stringify({ new_owner_id: ownerId }) },
        );
        return;
    }
    await setVendorOwner(vendorId, ownerId);
}

test.describe('Vendor Management (Deterministic)', () => {
    test('Single export button opens modal and exports selected format', async ({ riskManagerPage }) => {
        await ensureVendorArchived(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, false);
        const vendorsPage = new VendorsPage(riskManagerPage);
        await vendorsPage.navigate();

        await expect(riskManagerPage.getByTestId('vendors-export-button')).toHaveCount(1);
        await vendorsPage.openExportDialog();
        await expect(vendorsPage.exportDateInput).toHaveValue(todayLocalIso());
        // Export dialog is CSV-only; format chooser is intentionally absent.
        const exportRequest = riskManagerPage.waitForRequest((request) =>
            request.url().includes('/api/v1/vendors/export'),
        );
        await vendorsPage.submitExport('csv');
        const requestUrl = new URL((await exportRequest).url());
        expect(requestUrl.searchParams.get('locale')).toBe('en');
        await expect(vendorsPage.exportDialog).not.toBeVisible();
    });

    test('Vendor list shows active deterministic vendor by default', async ({ riskManagerPage }) => {
        await ensureVendorArchived(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, false);
        const vendorsPage = new VendorsPage(riskManagerPage);
        await vendorsPage.navigate();
        await vendorsPage.search(E2E_VENDORS.ACTIVE_PRIMARY.name);

        await expect(vendorsPage.rowByText(E2E_VENDORS.ACTIVE_PRIMARY.name)).toBeVisible();
    });

    test('Inactive vendor is hidden by default and shown when status is Inactive', async ({ riskManagerPage }) => {
        await ensureVendorArchived(E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id, true);
        const vendorsPage = new VendorsPage(riskManagerPage);
        await vendorsPage.navigate();
        await vendorsPage.search(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);

        await expect(vendorsPage.rowByText(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name)).toHaveCount(0);

        await vendorsPage.setStatusFilterInactive();
        await vendorsPage.search(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);
        await expect(vendorsPage.rowByText(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name)).toBeVisible();
    });

    test('Clicking deterministic vendor row opens vendor detail', async ({ riskManagerPage }) => {
        await ensureVendorArchived(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, false);
        const vendorsPage = new VendorsPage(riskManagerPage);
        await vendorsPage.navigate();
        await vendorsPage.search(E2E_VENDORS.ACTIVE_PRIMARY.name);

        await vendorsPage.openRowByText(E2E_VENDORS.ACTIVE_PRIMARY.name);
        await expect(riskManagerPage).toHaveURL(/\/vendors\/\d+$/);
        await expect(riskManagerPage.locator('main h1').first()).toContainText(E2E_VENDORS.ACTIVE_PRIMARY.name);
    });

    test('Vendor detail defaults to the merged overview surface', async ({ riskManagerPage }) => {
        const vendorId = await ensureVendorArchived(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, false);

        await riskManagerPage.goto(`/vendors/${vendorId}`);
        await waitForDataLoad(riskManagerPage);

        await expect(riskManagerPage.getByText(/Classification|Klasifikace/i).first()).toBeVisible();
        await expect(riskManagerPage.getByText(/Linked Risks|Navázaná rizika/i).first()).toBeVisible();
        await expect(riskManagerPage.getByText(/Linked Controls|Navázané kontroly/i).first()).toBeVisible();
        await expect(riskManagerPage.getByRole('button', { name: /Link Existing|Propojit existující/i }).first()).toBeVisible();
        await expect(riskManagerPage.getByRole('button', { name: /Add Risk|Přidat riziko/i })).toBeVisible();
        await expect(riskManagerPage.getByRole('button', { name: /Add Control|Přidat kontrolu/i })).toBeVisible();
        await expect(riskManagerPage.getByText('Highly complex', { exact: true })).toBeVisible();
        await expect(riskManagerPage.getByText('it.head@riskhub.local', { exact: false }).first()).toBeVisible();
    });

    test('Vendor edit searches active cross-department owners through the purpose-scoped endpoint', async ({ riskManagerPage }) => {
        const vendorId = await ensureVendorArchived(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, false);
        await riskManagerPage.goto(`/vendors/${vendorId}/edit`);
        await waitForDataLoad(riskManagerPage);

        const ownerLookup = riskManagerPage.waitForResponse((response) => {
            const url = new URL(response.url());
            return url.pathname.endsWith('/api/v1/users/lookup/vendor-owners')
                && url.searchParams.get('q') === 'ops.analyst@riskhub.local';
        });
        await riskManagerPage.getByTestId('vendor-form-owner-search').fill('ops.analyst@riskhub.local');
        expect((await ownerLookup).ok()).toBe(true);
        await expect(riskManagerPage.getByText(/ops\.analyst@riskhub\.local.*Operations/i).first()).toBeVisible();
    });

    test('Record-only Vendor owner submits an ordinary field diff with accountability and link actions gated', async ({ riskManagerPage }) => {
        const vendorId = await ensureVendorArchived(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, false);
        let patchPayload: Record<string, unknown> | null = null;
        let vendorSnapshot: Record<string, unknown> | null = null;

        await riskManagerPage.route(`**/api/v1/vendors/${vendorId}`, async (route) => {
            if (route.request().method() === 'GET') {
                const response = await route.fetch();
                const body = await response.json() as Record<string, unknown>;
                const capabilities = body.capabilities as Record<string, boolean>;
                vendorSnapshot = {
                    ...body,
                    capabilities: {
                        ...capabilities,
                        can_update: true,
                        can_manage_accountability: false,
                        can_create_linked_risk: false,
                        can_create_linked_control: false,
                        can_create_linked_kri: false,
                        can_link_risk: false,
                        can_link_control: false,
                        can_link_kri: false,
                    },
                };
                await route.fulfill({ response, json: vendorSnapshot });
                return;
            }
            if (route.request().method() === 'PATCH') {
                patchPayload = route.request().postDataJSON() as Record<string, unknown>;
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ...vendorSnapshot, ...patchPayload }),
                });
                return;
            }
            await route.continue();
        });

        await riskManagerPage.goto(`/vendors/${vendorId}/edit`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('vendor-form-department')).toBeDisabled();
        await expect(riskManagerPage.getByTestId('vendor-form-owner')).toBeDisabled();
        await expect(riskManagerPage.getByTestId('vendor-form-owner-search')).toBeDisabled();

        await riskManagerPage.getByTestId('vendor-form-name').fill('Owner-maintained Vendor');
        await riskManagerPage.getByRole('button', { name: /Save Changes|Uložit změny/i }).click();
        await expect.poll(() => patchPayload).toEqual({ name: 'Owner-maintained Vendor' });
        await expect(riskManagerPage).toHaveURL(new RegExp(`/vendors/${vendorId}$`));
        await expect(riskManagerPage.getByRole('button', { name: /Link Existing|Propojit existující/i })).toHaveCount(0);
        await expect(riskManagerPage.getByRole('button', { name: /Add Risk|Přidat riziko/i })).toHaveCount(0);
        await expect(riskManagerPage.getByRole('button', { name: /Add Control|Přidat kontrolu/i })).toHaveCount(0);
    });

    test('Vendor owner deactivation preserves evidence, locks edits, and requires Governance reassignment', async ({ riskManagerPage }) => {
        const vendorId = await ensureVendorArchived(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, false);
        const originalOwner = await getVendorOwnerByEmail(E2E_VENDORS.ACTIVE_PRIMARY.owner_email);
        const formerOwner = await ensureDedicatedVendorOwner();
        await restoreVendorOwnerBaseline(vendorId, originalOwner.id);
        await setVendorOwner(vendorId, formerOwner.id);

        try {
            await setUserActive(formerOwner.id, false);

            await riskManagerPage.goto(`/vendors/${vendorId}`);
            await waitForDataLoad(riskManagerPage);
            await expect(riskManagerPage.getByText('Ownership reassignment required').first()).toBeVisible();
            await expect(riskManagerPage.getByText(formerOwner.email, { exact: false }).first()).toBeVisible();

            await riskManagerPage.goto(`/vendors/${vendorId}/edit`);
            await waitForDataLoad(riskManagerPage);
            await expect(riskManagerPage.getByText('Ownership reassignment required').first()).toBeVisible();
            await expect(riskManagerPage.getByTestId('vendor-form-name')).toHaveCount(0);

            await riskManagerPage.goto('/governance?type=vendor');
            await waitForDataLoad(riskManagerPage);
            const orphanRow = riskManagerPage.locator('tbody tr').filter({
                hasText: E2E_VENDORS.ACTIVE_PRIMARY.name,
            });
            await expect(orphanRow).toContainText(formerOwner.email);
            await orphanRow.getByRole('button', { name: /Resolve/i }).click();
            await expect(riskManagerPage.getByTestId('resolve-orphan-ready')).toBeVisible();

            const ownerLookup = riskManagerPage.waitForResponse((response) => {
                const url = new URL(response.url());
                return url.pathname.endsWith('/api/v1/users/lookup/vendor-owners')
                    && url.searchParams.get('q') === originalOwner.email;
            });
            await riskManagerPage.getByTestId('orphan-owner-search').fill(originalOwner.email);
            expect((await ownerLookup).ok()).toBe(true);
            await riskManagerPage.getByRole('button', { name: new RegExp(originalOwner.email, 'i') }).click();
            await riskManagerPage.getByRole('button', { name: /Resolve item/i }).click();
            await expect(riskManagerPage.getByTestId('resolve-orphan-ready')).toHaveCount(0);

            await riskManagerPage.goto(`/vendors/${vendorId}/edit`);
            await waitForDataLoad(riskManagerPage);
            await expect(riskManagerPage.getByTestId('vendor-form-name')).toBeVisible();
            await expect(riskManagerPage.getByTestId('vendor-form-owner')).toBeEnabled();
        } finally {
            await setUserActive(formerOwner.id, true);
            await restoreVendorOwnerBaseline(vendorId, originalOwner.id);
        }
    });

    test('Legacy vendor tab links resolve to the canonical vendor detail URL', async ({ riskManagerPage }) => {
        const vendorId = await ensureVendorArchived(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, false);

        await riskManagerPage.goto(`/vendors/${vendorId}?tab=sla`);
        await waitForDataLoad(riskManagerPage);

        await expect(riskManagerPage).toHaveURL(new RegExp(`/vendors/${vendorId}$`));
        await expect(riskManagerPage.getByText(/Linked Controls|Navázané kontroly/i).first()).toBeVisible();
    });

    test('Vendor register groups vendors by flag with insignificant fallback', async ({ riskManagerPage }) => {
        await ensureVendorArchived(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, false);
        await ensureVendorArchived(E2E_VENDORS.ACTIVE_SECONDARY.registration_id, false);
        await ensureVendorArchived(E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id, false);

        const vendorsPage = new VendorsPage(riskManagerPage);
        await vendorsPage.navigate();

        await riskManagerPage.getByRole('button', { name: /By Flag|Podle příznaku/i }).click();
        await expect(riskManagerPage.getByRole('button', { name: /^DORA relevant/i })).toBeVisible();
        await expect(riskManagerPage.getByRole('button', { name: /^Supports core function/i })).toBeVisible();
        await expect(riskManagerPage.getByRole('button', { name: /^Significant vendor/i })).toBeVisible();
        await expect(riskManagerPage.getByRole('button', { name: /^Insignificant vendors/i })).toBeVisible();

        await riskManagerPage.getByRole('button', { name: /^Insignificant vendors/i }).click();
        await expect(riskManagerPage.getByText(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name).first()).toBeVisible({
            timeout: 15000,
        });
    });

    test('Vendor detail links an existing KRI and KRI register reflects the vendor grouping', async ({ riskManagerPage }) => {
        const vendorId = await ensureVendorArchived(E2E_VENDORS.ACTIVE_SECONDARY.registration_id, false);
        const kri = await getKRIByMetricName(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);
        expect(kri).not.toBeNull();

        await unlinkVendorFromKRI(vendorId, kri!.id);

        await riskManagerPage.goto(`/vendors/${vendorId}`);
        await waitForDataLoad(riskManagerPage);

        const linkedKriSection = riskManagerPage.getByTestId('vendor-linked-kris-section');
        await expect(linkedKriSection).toBeVisible({ timeout: 15000 });
        await linkedKriSection.getByTestId('vendor-linked-kris-link-existing').click();

        const dialog = riskManagerPage.getByTestId('link-management-dialog');
        await expect(dialog).toBeVisible({ timeout: 15000 });
        await dialog.getByPlaceholder(/Search KRIs|Hledat KRI/i).fill(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);
        await dialog.getByRole('button', { name: new RegExp(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name, 'i') }).click();
        await dialog.getByRole('button', { name: /Create Link|Vytvořit propojení/i }).click();
        await expect(dialog).not.toBeVisible({ timeout: 15000 });

        await expect(linkedKriSection.getByText(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name).first()).toBeVisible({
            timeout: 15000,
        });

        await riskManagerPage.goto('/kris');
        await waitForDataLoad(riskManagerPage);
        await riskManagerPage.getByTestId('kris-search-input').fill(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);
        await riskManagerPage.getByRole('button', { name: /By Vendor|Podle dodavatele/i }).click();
        await riskManagerPage.getByRole('button', { name: /E2E-VENDOR-002 AML Screening Service/i }).click();

        await expect(riskManagerPage.getByText(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name).first()).toBeVisible({
            timeout: 15000,
        });
    });

    test('Vendor detail Add KRI creates and links the new KRI back to the vendor', async ({ riskManagerPage }) => {
        const vendorId = await ensureVendorArchived(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, false);
        const riskId = await ensureRiskStatus(E2E_RISKS.ARCHIVE_ACTIVE_PAIR.code, 'active');
        await linkVendorToRisk(vendorId, riskId);

        const metricName = `E2E-VENDOR-KRI-${Date.now()}`;

        await riskManagerPage.goto(`/vendors/${vendorId}`);
        await waitForDataLoad(riskManagerPage);

        const linkedKriSection = riskManagerPage.getByTestId('vendor-linked-kris-section');
        await linkedKriSection.getByTestId('vendor-linked-kris-add-kri').click();

        await expect(riskManagerPage).toHaveURL(new RegExp(`/kris/new\\?vendor_id=${vendorId}`));
        await expect(riskManagerPage.getByTestId('kri-vendor-context-banner')).toBeVisible({ timeout: 15000 });
        await riskManagerPage.getByRole('button', { name: new RegExp(E2E_RISKS.ARCHIVE_ACTIVE_PAIR.name, 'i') }).click();
        await riskManagerPage.getByRole('button', { name: /Next|Další/i }).click();
        await riskManagerPage.getByPlaceholder(/Customer complaint rate|Míra stížností zákazníků/i).fill(metricName);
        await riskManagerPage.getByPlaceholder(/Describe what this KRI measures|Popište, co tento KRI měří/i).fill(
            'E2E KRI created from vendor detail.',
        );
        await riskManagerPage.getByRole('button', { name: /Create KRI|Vytvořit KRI/i }).click();

        await expect(riskManagerPage).toHaveURL(new RegExp(`/vendors/${vendorId}$`));
        await expect(
            riskManagerPage.getByText(/KRI created and linked to the vendor|KRI bylo vytvořeno a navázáno na dodavatele/i),
        ).toBeVisible({ timeout: 15000 });
        await expect(
            riskManagerPage.getByTestId('vendor-linked-kris-section').getByText(metricName).first(),
        ).toBeVisible({ timeout: 15000 });
    });
});
