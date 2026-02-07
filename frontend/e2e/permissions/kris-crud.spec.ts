import { test, expect } from '../fixtures/auth.fixture';
import { E2E_KRIS } from '../fixtures/e2e-data';
import { KRIsPage } from '../pages/KRIsPage';
import { waitForTableRowByText } from '../helpers/wait';

test.describe('KRI CRUD Permissions (Deterministic)', () => {
    test('Risk Manager can see deterministic KRI row', async ({ riskManagerPage }) => {
        const krisPage = new KRIsPage(riskManagerPage);
        await krisPage.navigate();
        await krisPage.search(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);

        await expect(krisPage.rowByText(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name)).toBeVisible();
    });

    test('Department Head can see New KRI button', async ({ deptHeadPage }) => {
        const krisPage = new KRIsPage(deptHeadPage);
        await krisPage.navigate();
        await krisPage.expectCreateButtonVisible();
    });

    test('Risk Manager can open deterministic KRI detail', async ({ riskManagerPage }) => {
        const krisPage = new KRIsPage(riskManagerPage);
        await krisPage.navigate();
        await krisPage.search(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);

        await krisPage.openRowByText(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);
        await expect(riskManagerPage).toHaveURL(/\/kris\/\d+$/);
        await expect(riskManagerPage.locator('h1, h2').first()).toBeVisible();
    });

    test('Archived toggle defaults off and hides archived deterministic KRI', async ({ riskManagerPage }) => {
        const krisPage = new KRIsPage(riskManagerPage);
        await krisPage.navigate();

        await expect(krisPage.includeArchivedCheckbox).not.toBeChecked();
        await krisPage.search(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);

        const archivedVisibleWithoutToggle = await waitForTableRowByText(
            riskManagerPage,
            E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name,
            2000,
        );
        expect(archivedVisibleWithoutToggle).toBe(false);
    });

    test('Archived deterministic KRI appears when include archived is enabled', async ({ riskManagerPage }) => {
        const krisPage = new KRIsPage(riskManagerPage);
        await krisPage.navigate();
        await krisPage.setIncludeArchived(true);
        await krisPage.search(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);

        await expect(krisPage.rowByText(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name)).toBeVisible();
    });

    test('Risk Manager sees unarchive action on archived deterministic KRI row', async ({ riskManagerPage }) => {
        const krisPage = new KRIsPage(riskManagerPage);
        await krisPage.navigate();
        await krisPage.setIncludeArchived(true);
        await krisPage.search(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);

        const row = krisPage.rowByText(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);
        await expect(row).toBeVisible();
        await expect(row.locator('button:has-text("Unarchive"), button:has-text("Obnov")').first()).toBeVisible();
    });
});
