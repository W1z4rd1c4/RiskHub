import { test, expect } from './fixtures/auth.fixture';
import { E2E_VENDORS } from './fixtures/e2e-data';
import { ensureVendorStatus } from './helpers/api-auth';
import { VendorsPage } from './pages/VendorsPage';

function todayLocalIso(): string {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

test.describe('Vendor Management (Deterministic)', () => {
    test('Single export button opens modal and exports selected format', async ({ riskManagerPage }) => {
        await ensureVendorStatus(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, 'active');
        const vendorsPage = new VendorsPage(riskManagerPage);
        await vendorsPage.navigate();

        await expect(riskManagerPage.getByTestId('vendors-export-button')).toHaveCount(1);
        await vendorsPage.openExportDialog();
        await expect(vendorsPage.exportDateInput).toHaveValue(todayLocalIso());
        await vendorsPage.exportFormatTrigger.click();
        await expect(riskManagerPage.getByTestId('export-format-option-pdf')).toHaveCount(0);

        await vendorsPage.chooseExportFormat('csv');
        await vendorsPage.submitExport('csv');
        await expect(vendorsPage.exportDialog).not.toBeVisible();
    });

    test('Vendor list shows active deterministic vendor by default', async ({ riskManagerPage }) => {
        await ensureVendorStatus(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, 'active');
        const vendorsPage = new VendorsPage(riskManagerPage);
        await vendorsPage.navigate();
        await vendorsPage.search(E2E_VENDORS.ACTIVE_PRIMARY.name);

        await expect(vendorsPage.rowByText(E2E_VENDORS.ACTIVE_PRIMARY.name)).toBeVisible();
    });

    test('Inactive vendor is hidden by default and shown when status is Inactive', async ({ riskManagerPage }) => {
        await ensureVendorStatus(E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id, 'inactive');
        const vendorsPage = new VendorsPage(riskManagerPage);
        await vendorsPage.navigate();
        await vendorsPage.search(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);

        await expect(vendorsPage.rowByText(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name)).toHaveCount(0);

        await vendorsPage.setStatusFilterInactive();
        await vendorsPage.search(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name);
        await expect(vendorsPage.rowByText(E2E_VENDORS.INACTIVE_RESTORE_TARGET.name)).toBeVisible();
    });

    test('Clicking deterministic vendor row opens vendor detail', async ({ riskManagerPage }) => {
        await ensureVendorStatus(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, 'active');
        const vendorsPage = new VendorsPage(riskManagerPage);
        await vendorsPage.navigate();
        await vendorsPage.search(E2E_VENDORS.ACTIVE_PRIMARY.name);

        await vendorsPage.openRowByText(E2E_VENDORS.ACTIVE_PRIMARY.name);
        await expect(riskManagerPage).toHaveURL(/\/vendors\/\d+$/);
        await expect(riskManagerPage.locator('h1').first()).toContainText(E2E_VENDORS.ACTIVE_PRIMARY.name);
    });
});
