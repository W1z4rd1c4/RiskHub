import { test, expect } from './fixtures/auth.fixture';
import { E2E_KRIS } from './fixtures/e2e-data';
import { KRIsPage } from './pages/KRIsPage';
import { waitForTableRowByText } from './helpers/wait';

test.describe('KRI Management (Deterministic)', () => {
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
        await expect(riskManagerPage.locator('h1, h2').first()).toBeVisible();
    });

    test('Archived KRI row exposes unarchive action for privileged users', async ({ riskManagerPage }) => {
        const krisPage = new KRIsPage(riskManagerPage);
        await krisPage.navigate();
        await krisPage.setStatusFilterArchived();
        await krisPage.search(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);

        const row = krisPage.rowByText(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);
        await expect(row).toBeVisible();
        await expect(row.locator('button:has-text("Unarchive"), button:has-text("Obnov")').first()).toBeVisible();
    });
});
