import { test, expect } from './fixtures/auth.fixture';
import { E2E_CONTROLS } from './fixtures/e2e-data';
import { ControlsPage } from './pages/ControlsPage';
import { waitForDataLoad, waitForTableRowByText } from './helpers/wait';

function todayLocalIso(): string {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

test.describe('Control Management (Deterministic)', () => {
    test('Single export button opens modal and exports selected format', async ({ riskManagerPage }) => {
        const controlsPage = new ControlsPage(riskManagerPage);
        await controlsPage.navigate();

        await expect(riskManagerPage.getByTestId('controls-export-button')).toHaveCount(1);
        await controlsPage.openExportDialog();
        await expect(controlsPage.exportDateInput).toHaveValue(todayLocalIso());
        // Export dialog is CSV-only; format chooser is intentionally absent.
        await controlsPage.submitExport('csv');
        await expect(controlsPage.exportDialog).not.toBeVisible();
    });

    test('Control list renders seeded active control', async ({ riskManagerPage }) => {
        const controlsPage = new ControlsPage(riskManagerPage);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.ARCHIVE_ACTIVE_PAIR.name);

        const rowVisible = await waitForTableRowByText(
            riskManagerPage,
            E2E_CONTROLS.ARCHIVE_ACTIVE_PAIR.name,
            15000
        );
        expect(rowVisible).toBe(true);
    });

    test('Archived control visibility follows archived status filter', async ({ riskManagerPage }) => {
        const controlsPage = new ControlsPage(riskManagerPage);
        await controlsPage.navigate();
        await controlsPage.setStatusFilterArchived();
        await controlsPage.search(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name);
        await expect(controlsPage.rowByText(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name)).toBeVisible();
    });

    test('Control detail navigation works for deterministic control row', async ({ riskManagerPage }) => {
        const controlsPage = new ControlsPage(riskManagerPage);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);

        const rowVisible = await waitForTableRowByText(
            riskManagerPage,
            E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name,
            15000
        );
        expect(rowVisible).toBe(true);
        await controlsPage.openRowByText(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);
        await expect(riskManagerPage).toHaveURL(/\/controls\/\d+$/);
        await waitForDataLoad(riskManagerPage, 15000);
        await expect(riskManagerPage.getByText(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name).first()).toBeVisible({ timeout: 15000 });
    });

    test('Archived control row exposes unarchive action for privileged users', async ({ riskManagerPage }) => {
        const controlsPage = new ControlsPage(riskManagerPage);
        await controlsPage.navigate();
        await controlsPage.setStatusFilterArchived();
        await controlsPage.search(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name);

        const rowVisible = await waitForTableRowByText(
            riskManagerPage,
            E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name,
            15000
        );
        expect(rowVisible).toBe(true);
        const row = controlsPage.rowByText(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name);
        await expect(row).toBeVisible({ timeout: 15000 });
        await expect(row.locator('[data-testid^="control-unarchive-"]').first()).toBeVisible();
    });
});
