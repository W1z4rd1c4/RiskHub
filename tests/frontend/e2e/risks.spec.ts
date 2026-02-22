import { test, expect } from './fixtures/auth.fixture';
import { E2E_RISKS } from './fixtures/e2e-data';
import { RisksPage } from './pages/RisksPage';
import { waitForDataLoad, waitForTableRowByText } from './helpers/wait';

function todayLocalIso(): string {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

test.describe('Risk Management (Deterministic)', () => {
    test('Single export button opens modal and exports selected format', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();

        await expect(riskManagerPage.getByTestId('risks-export-button')).toHaveCount(1);
        await risksPage.openExportDialog();
        await expect(risksPage.exportDateInput).toHaveValue(todayLocalIso());
        // Export dialog is CSV-only; format chooser is intentionally absent.
        await risksPage.submitExport('csv');
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

    test('Archived risk visibility follows archived status filter', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.ARCHIVE_RESTORE_TARGET.name);

        const hiddenByDefault = await waitForTableRowByText(riskManagerPage, E2E_RISKS.ARCHIVE_RESTORE_TARGET.name, 2000);
        expect(hiddenByDefault).toBe(false);

        await risksPage.setStatusFilterArchived();
        await risksPage.search(E2E_RISKS.ARCHIVE_RESTORE_TARGET.name);
        await expect(risksPage.rowByText(E2E_RISKS.ARCHIVE_RESTORE_TARGET.name)).toBeVisible();
    });

    test('Risk detail supports KRI card navigation to full KRI page', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.PENDING_DELETE_APPROVAL.name);
        await risksPage.openRowByText(E2E_RISKS.PENDING_DELETE_APPROVAL.name);

        const kriSection = riskManagerPage
            .locator('div.glass-card')
            .filter({ has: riskManagerPage.getByRole('heading', { name: /risk appetite indicators/i }) })
            .first();

        await expect(kriSection).toBeVisible();
        await kriSection.locator('h4').first().click();

        await riskManagerPage.waitForURL(/\/kris\/\d+/, { timeout: 15000 });
    });

    test('Add KRI from risk detail navigates to /kris/new with risk_id', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.PENDING_DELETE_APPROVAL.name);
        await risksPage.openRowByText(E2E_RISKS.PENDING_DELETE_APPROVAL.name);

        const riskId = riskManagerPage.url().split('/').pop();
        const addKriButton = riskManagerPage.getByRole('button', { name: /add kri/i });
        await expect(addKriButton).toBeVisible();

        await addKriButton.click();
        await riskManagerPage.waitForURL(/\/kris\/new(\?.*)?$/, { timeout: 15000 });

        const url = new URL(riskManagerPage.url());
        expect(url.searchParams.get('risk_id')).toBe(riskId);
        await waitForDataLoad(riskManagerPage);
    });
});
