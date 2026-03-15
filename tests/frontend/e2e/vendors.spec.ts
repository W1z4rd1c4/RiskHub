import { test, expect } from './fixtures/auth.fixture';
import { E2E_KRIS, E2E_RISKS, E2E_VENDORS } from './fixtures/e2e-data';
import {
    ensureRiskStatus,
    ensureVendorStatus,
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

test.describe('Vendor Management (Deterministic)', () => {
    test('Single export button opens modal and exports selected format', async ({ riskManagerPage }) => {
        await ensureVendorStatus(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, 'active');
        const vendorsPage = new VendorsPage(riskManagerPage);
        await vendorsPage.navigate();

        await expect(riskManagerPage.getByTestId('vendors-export-button')).toHaveCount(1);
        await vendorsPage.openExportDialog();
        await expect(vendorsPage.exportDateInput).toHaveValue(todayLocalIso());
        // Export dialog is CSV-only; format chooser is intentionally absent.
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

    test('Vendor detail defaults to the merged overview surface', async ({ riskManagerPage }) => {
        const vendorId = await ensureVendorStatus(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, 'active');

        await riskManagerPage.goto(`/vendors/${vendorId}`);
        await waitForDataLoad(riskManagerPage);

        await expect(riskManagerPage.getByText(/Classification|Klasifikace/i).first()).toBeVisible();
        await expect(riskManagerPage.getByText(/Linked Risks|Navázaná rizika/i).first()).toBeVisible();
        await expect(riskManagerPage.getByText(/Linked Controls|Navázané kontroly/i).first()).toBeVisible();
        await expect(riskManagerPage.getByRole('button', { name: /Link Existing|Propojit existující/i }).first()).toBeVisible();
        await expect(riskManagerPage.getByRole('button', { name: /Add Risk|Přidat riziko/i })).toBeVisible();
        await expect(riskManagerPage.getByRole('button', { name: /Add Control|Přidat kontrolu/i })).toBeVisible();
    });

    test('Legacy vendor tab links resolve to the canonical vendor detail URL', async ({ riskManagerPage }) => {
        const vendorId = await ensureVendorStatus(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, 'active');

        await riskManagerPage.goto(`/vendors/${vendorId}?tab=sla`);
        await waitForDataLoad(riskManagerPage);

        await expect(riskManagerPage).toHaveURL(new RegExp(`/vendors/${vendorId}$`));
        await expect(riskManagerPage.getByText(/Linked Controls|Navázané kontroly/i).first()).toBeVisible();
    });

    test('Vendor register groups vendors by flag with insignificant fallback', async ({ riskManagerPage }) => {
        await ensureVendorStatus(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, 'active');
        await ensureVendorStatus(E2E_VENDORS.ACTIVE_SECONDARY.registration_id, 'active');
        await ensureVendorStatus(E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id, 'active');

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
        const vendorId = await ensureVendorStatus(E2E_VENDORS.ACTIVE_SECONDARY.registration_id, 'active');
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
        const vendorId = await ensureVendorStatus(E2E_VENDORS.ACTIVE_PRIMARY.registration_id, 'active');
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
