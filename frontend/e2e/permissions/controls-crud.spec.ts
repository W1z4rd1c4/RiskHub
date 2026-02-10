import { test, expect } from '../fixtures/auth.fixture';
import { E2E_CONTROLS } from '../fixtures/e2e-data';
import { ControlsPage } from '../pages/ControlsPage';
import { waitForTableRowByText } from '../helpers/wait';

test.describe('Control CRUD Permissions (Deterministic)', () => {
    test('Risk Manager can see deterministic control row', async ({ riskManagerPage }) => {
        const controlsPage = new ControlsPage(riskManagerPage);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.PENDING_DELETE_APPROVAL.name);

        const rowVisible = await waitForTableRowByText(
            riskManagerPage,
            E2E_CONTROLS.PENDING_DELETE_APPROVAL.name,
            15000,
        );
        expect(rowVisible).toBe(true);
    });

    test('Employee cannot see New Control button', async ({ employeePage }) => {
        const controlsPage = new ControlsPage(employeePage);
        await controlsPage.navigate();
        await controlsPage.expectCreateButtonHidden();
    });

    test('Risk Manager can open deterministic control detail', async ({ riskManagerPage }) => {
        const controlsPage = new ControlsPage(riskManagerPage);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.PENDING_DELETE_APPROVAL.name);

        await controlsPage.openRowByText(E2E_CONTROLS.PENDING_DELETE_APPROVAL.name);
        await expect(riskManagerPage).toHaveURL(/\/controls\/\d+$/);
        await expect(riskManagerPage.locator('h1, h2').first()).toBeVisible();
    });

    test('Archived deterministic control is hidden by default until status is Archived', async ({ riskManagerPage }) => {
        const controlsPage = new ControlsPage(riskManagerPage);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name);

        const archivedVisibleWithoutToggle = await waitForTableRowByText(
            riskManagerPage,
            E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name,
            2000,
        );
        expect(archivedVisibleWithoutToggle).toBe(false);
    });

    test('Archived deterministic control appears when status filter is Archived', async ({ riskManagerPage }) => {
        const controlsPage = new ControlsPage(riskManagerPage);
        await controlsPage.navigate();
        await controlsPage.setStatusFilterArchived();
        await controlsPage.search(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name);

        await expect(controlsPage.rowByText(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name)).toBeVisible();
    });

    test('Risk Manager sees unarchive action on archived deterministic control row', async ({ riskManagerPage }) => {
        const controlsPage = new ControlsPage(riskManagerPage);
        await controlsPage.navigate();
        await controlsPage.setStatusFilterArchived();
        await controlsPage.search(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name);

        const row = controlsPage.rowByText(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name);
        await expect(row).toBeVisible();
        await expect(row.locator('button:has-text("Unarchive"), button:has-text("Obnov")').first()).toBeVisible();
    });
});
