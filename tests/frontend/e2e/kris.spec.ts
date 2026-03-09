import { test, expect } from './fixtures/auth.fixture';
import { E2E_KRIS } from './fixtures/e2e-data';
import { ensureVendorStatus, getKRIByMetricName, linkVendorToKRI } from './helpers/api-auth';
import { KRIsPage } from './pages/KRIsPage';
import { waitForTableRowByText } from './helpers/wait';

function todayLocalIso(): string {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

test.describe('KRI Management (Deterministic)', () => {
    test('Single export button opens modal and exports selected format', async ({ riskManagerPage }) => {
        const krisPage = new KRIsPage(riskManagerPage);
        await krisPage.navigate();

        await expect(riskManagerPage.getByTestId('kris-export-button')).toHaveCount(1);
        await krisPage.openExportDialog();
        await expect(krisPage.exportDateInput).toHaveValue(todayLocalIso());
        // Export dialog is CSV-only; format chooser is intentionally absent.
        await krisPage.submitExport('csv');
        await expect(krisPage.exportDialog).not.toBeVisible();
    });

    test('KRI list renders seeded active KRI', async ({ riskManagerPage }) => {
        const krisPage = new KRIsPage(riskManagerPage);
        await krisPage.navigate();
        await krisPage.search(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);

        await expect(krisPage.rowByText(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name)).toBeVisible();
    });

    test('Archived KRI visibility follows archived status filter', async ({ riskManagerPage }) => {
        const krisPage = new KRIsPage(riskManagerPage);
        await krisPage.navigate();
        await krisPage.search(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);

        const hiddenByDefault = await waitForTableRowByText(riskManagerPage, E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name, 2000);
        expect(hiddenByDefault).toBe(false);

        await krisPage.setStatusFilterArchived();
        await krisPage.search(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);
        await expect(krisPage.rowByText(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name)).toBeVisible();
    });

    test('Deterministic KRI row opens KRI detail page', async ({ riskManagerPage }) => {
        const krisPage = new KRIsPage(riskManagerPage);
        await krisPage.navigate();
        await krisPage.search(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);

        await krisPage.openRowByText(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);
        await expect(riskManagerPage).toHaveURL(/\/kris\/\d+$/);
        await expect(
            riskManagerPage.getByRole('heading', { name: E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name })
        ).toBeVisible({ timeout: 15000 });
    });

    test('Archived KRI row exposes unarchive action for privileged users', async ({ riskManagerPage }) => {
        const krisPage = new KRIsPage(riskManagerPage);
        await krisPage.navigate();
        await krisPage.setStatusFilterArchived();
        await krisPage.search(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);

        const row = krisPage.rowByText(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);
        await expect(row).toBeVisible();
        await expect(row.locator('[data-testid^="kri-unarchive-"]').first()).toBeVisible();
    });

    test('KRI register groups linked KRIs by vendor', async ({ riskManagerPage }) => {
        const vendorId = await ensureVendorStatus('E2E-VREG-001', 'active');
        const kri = await getKRIByMetricName(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);
        expect(kri).not.toBeNull();
        await linkVendorToKRI(vendorId, kri!.id);

        const krisPage = new KRIsPage(riskManagerPage);
        await krisPage.navigate();
        await krisPage.search(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);

        await riskManagerPage.getByRole('button', { name: /By Vendor|Podle dodavatele/i }).click();
        await riskManagerPage.getByRole('button', { name: /E2E-VENDOR-001 Claims Cloud Platform/i }).click();

        await expect(riskManagerPage.getByText(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name).first()).toBeVisible({
            timeout: 15000,
        });
    });
});
