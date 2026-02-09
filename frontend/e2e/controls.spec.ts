import { test, expect } from './fixtures/auth.fixture';
import { E2E_CONTROLS } from './fixtures/e2e-data';
import { ControlsPage } from './pages/ControlsPage';
import { waitForDataLoad, waitForTableRowByText } from './helpers/wait';

test.describe('Control Management (Deterministic)', () => {
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

    test('Archived control visibility follows include archived toggle', async ({ riskManagerPage }) => {
        const controlsPage = new ControlsPage(riskManagerPage);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name);

        const hiddenByDefault = await waitForTableRowByText(riskManagerPage, E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name, 2000);
        expect(hiddenByDefault).toBe(false);

        await controlsPage.setIncludeArchived(true);
        await controlsPage.search(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name);
        await expect(controlsPage.rowByText(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name)).toBeVisible();
    });

    test('Control detail navigation works for deterministic control row', async ({ riskManagerPage }) => {
        const controlsPage = new ControlsPage(riskManagerPage);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);

        await expect(controlsPage.rowByText(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name)).toBeVisible();
        await controlsPage.openRowByText(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);
        await expect(riskManagerPage).toHaveURL(/\/controls\/\d+$/);
        await waitForDataLoad(riskManagerPage, 15000);
        await expect(riskManagerPage.getByText(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name).first()).toBeVisible({ timeout: 15000 });
    });

    test('Archived control row exposes unarchive action for privileged users', async ({ riskManagerPage }) => {
        const controlsPage = new ControlsPage(riskManagerPage);
        await controlsPage.navigate();
        await controlsPage.setIncludeArchived(true);
        await controlsPage.search(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name);

        const row = controlsPage.rowByText(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name);
        await expect(row).toBeVisible();
        await expect(row.locator('button:has-text("Unarchive"), button:has-text("Obnov")').first()).toBeVisible();
    });
});
