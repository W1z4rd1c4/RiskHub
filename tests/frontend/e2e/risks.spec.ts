import { test, expect } from './fixtures/auth.fixture';
import { E2E_RISKS } from './fixtures/e2e-data';
import { ensureRiskStatus, ensureVendorArchived, getRiskByCode, linkVendorToRisk } from './helpers/api-auth';
import { RisksPage } from './pages/RisksPage';
import { waitForDataLoad, waitForTableRowByText } from './helpers/wait';

function todayLocalIso(): string {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

test.describe('Risk Management (Deterministic)', () => {
    test('Export dialog explicitly produces a mature point-in-time snapshot', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();

        await expect(riskManagerPage.getByTestId('risks-export-button')).toHaveCount(1);
        await risksPage.openExportDialog();
        await expect(risksPage.currentViewExportPurpose).toBeChecked();
        await expect(risksPage.exportDateInput).not.toBeVisible();
        await risksPage.selectPointInTimeExport();
        const asOfDate = todayLocalIso();
        await expect(risksPage.exportDateInput).toHaveValue(asOfDate);
        // Export dialog is CSV-only; format chooser is intentionally absent.
        const response = await risksPage.submitPointInTimeExport('csv');
        const exportUrl = new URL(response.url());
        expect(exportUrl.pathname).toBe('/api/v1/reports/risks/export');
        expect(exportUrl.searchParams.get('format')).toBe('csv');
        expect(exportUrl.searchParams.get('as_of_date')).toBe(asOfDate);
        expect(response.headers()['content-type']).toContain('text/csv');
        const [header] = (await response.text()).split(/\r?\n/, 1);
        expect(header).toBe('Risk ID,Name,Process,Category,Type,Gross Score,Net Score,Status,Priority,Owner,Department,Controls,KRIs');
        await expect(risksPage.exportDialog).not.toBeVisible();
    });

    test('Risk list renders seeded active entity', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.ARCHIVE_ACTIVE_PAIR.name);

        const rowVisible = await waitForTableRowByText(
            riskManagerPage,
            E2E_RISKS.ARCHIVE_ACTIVE_PAIR.name,
            15000
        );
        expect(rowVisible).toBe(true);
    });

    test('Archived risk visibility follows archived lifecycle filter', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.ARCHIVE_RESTORE_TARGET.name);

        const hiddenByDefault = await waitForTableRowByText(riskManagerPage, E2E_RISKS.ARCHIVE_RESTORE_TARGET.name, 2000);
        expect(hiddenByDefault).toBe(false);

        await risksPage.setStatusFilterArchived();
        await risksPage.search(E2E_RISKS.ARCHIVE_RESTORE_TARGET.name);
        const archivedRowVisible = await waitForTableRowByText(
            riskManagerPage,
            E2E_RISKS.ARCHIVE_RESTORE_TARGET.name,
            15000
        );
        expect(archivedRowVisible).toBe(true);
    });

    test('Risk detail supports KRI card navigation to full KRI page', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.PENDING_DELETE_APPROVAL.name);
        await risksPage.openRowByText(E2E_RISKS.PENDING_DELETE_APPROVAL.name);

        await waitForDataLoad(riskManagerPage, 30000);
        await expect(
            riskManagerPage.getByRole('heading', { level: 2, name: E2E_RISKS.PENDING_DELETE_APPROVAL.name })
        ).toBeVisible({ timeout: 15000 });

        const kriCardHeading = riskManagerPage.locator('h4').filter({ hasText: /E2E-KRI-|KRI/i }).first();
        await expect(kriCardHeading).toBeVisible({ timeout: 15000 });
        await kriCardHeading.click();

        await riskManagerPage.waitForURL(/\/kris\/\d+/, { timeout: 15000 });
    });

    test('Add KRI from risk detail navigates to /kris/new with risk_id', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.PENDING_DELETE_APPROVAL.name);
        await risksPage.openRowByText(E2E_RISKS.PENDING_DELETE_APPROVAL.name);

        await waitForDataLoad(riskManagerPage, 30000);
        const riskId = riskManagerPage.url().split('/').pop();
        const addKriButton = riskManagerPage
            .getByRole('button', { name: /add kri|přidat kri|přidat.*indik/i })
            .first();
        await expect(addKriButton).toBeVisible({ timeout: 15000 });

        await addKriButton.click();
        await riskManagerPage.waitForURL(/\/kris\/new(\?.*)?$/, { timeout: 15000 });

        const url = new URL(riskManagerPage.url());
        expect(url.searchParams.get('risk_id')).toBe(riskId);
        await waitForDataLoad(riskManagerPage);
    });

    test('Risk register groups linked risks by vendor', async ({ riskManagerPage }) => {
        const vendorId = await ensureVendorArchived('E2E-VREG-001', false);
        await ensureRiskStatus(E2E_RISKS.ARCHIVE_ACTIVE_PAIR.code, 'active');
        const risk = await getRiskByCode(E2E_RISKS.ARCHIVE_ACTIVE_PAIR.code);
        expect(risk).not.toBeNull();
        await linkVendorToRisk(vendorId, risk!.id);

        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.ARCHIVE_ACTIVE_PAIR.name);

        await riskManagerPage.getByRole('button', { name: /By Vendor|Podle dodavatele/i }).click();
        await riskManagerPage.getByRole('button', { name: /E2E-VENDOR-001 Claims Cloud Platform/i }).click();

        await expect(riskManagerPage.getByText(E2E_RISKS.ARCHIVE_ACTIVE_PAIR.name).first()).toBeVisible({
            timeout: 15000,
        });
    });
});
