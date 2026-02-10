import { test, expect } from '../fixtures/auth.fixture';
import { E2E_VENDORS } from '../fixtures/e2e-data';
import { ensureVendorStatus, getVendorByRegistration } from '../helpers/api-auth';
import { VendorsPage } from '../pages/VendorsPage';

test.describe('Vendor CRUD Permissions (Deterministic)', () => {
    test.beforeEach(async () => {
        await ensureVendorStatus(E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id, 'inactive');
    });

    test('Privileged user can restore inactive vendor from list', async ({ riskManagerPage }) => {
        const vendorsPage = new VendorsPage(riskManagerPage);
        await vendorsPage.navigate();
        await vendorsPage.setStatusFilterInactive();
        await vendorsPage.search(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);

        const row = vendorsPage.rowByText(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);
        await expect(row).toBeVisible();
        await expect(row.locator('[data-testid^="vendor-unarchive-"]').first()).toBeVisible();

        await vendorsPage.clickUnarchiveForRow(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);

        const vendorAfterRestore = await getVendorByRegistration(E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id);
        expect(vendorAfterRestore?.status).toBe('active');

        await ensureVendorStatus(E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id, 'inactive');
    });

    test('Department-scoped user without delete permission cannot see restore action', async ({ deptHeadPage }) => {
        const vendorsPage = new VendorsPage(deptHeadPage);
        await vendorsPage.navigate();
        await vendorsPage.setStatusFilterInactive();
        await vendorsPage.search(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);

        const row = vendorsPage.rowByText(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);
        await expect(row).toBeVisible();
        await expect(row.locator('[data-testid^="vendor-unarchive-"]').first()).toHaveCount(0);
    });
});
