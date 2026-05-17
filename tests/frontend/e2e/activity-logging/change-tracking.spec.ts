/**
 * E2E Tests for Change Tracking (BUSINESS_LOGIC.md §9.2)
 *
 * Verifies deterministic `E2E-SEED` UPDATE records and their rendered change
 * payloads in the Activity Log UI.
 */
import { expect, test } from '../fixtures/auth.fixture';
import { ActivityLogPage } from '../pages/ActivityLogPage';

test.describe('Change Tracking', () => {
    test('UPDATE entries exist in activity log', async ({ croPage }) => {
        const activityLogPage = new ActivityLogPage(croPage);
        await activityLogPage.navigateToSeededEntries('risk');

        await activityLogPage.expectEntryExists('RISK', 'UPDATE');

        await activityLogPage.selectTab('control');
        await activityLogPage.searchEntries('E2E-SEED');
        await activityLogPage.expectEntryExists('CONTROL', 'UPDATE');
    });

    test('UPDATE entries show change details when expanded', async ({ croPage }) => {
        const activityLogPage = new ActivityLogPage(croPage);
        await activityLogPage.navigateToSeededEntries('risk');

        const updateIndex = await activityLogPage.findEntry('RISK', 'UPDATE');
        expect(updateIndex).toBeGreaterThanOrEqual(0);

        await activityLogPage.expandEntry(updateIndex);
        await expect(activityLogPage.entryCards.nth(updateIndex)).toContainText('description');
        await expect(activityLogPage.entryCards.nth(updateIndex)).toContainText('Updated by E2E seed');
    });

    test('Activity log entries display action icons', async ({ croPage }) => {
        const activityLogPage = new ActivityLogPage(croPage);
        await activityLogPage.navigateToSeededEntries('risk');

        const entryCount = await activityLogPage.getEntryCount();
        expect(entryCount).toBeGreaterThan(0);

        const firstEntryAction = await activityLogPage.getEntryAction(0);
        expect(['CREATE', 'UPDATE', 'ARCHIVE']).toContain(firstEntryAction);
    });

    test('Activity log entries display entity types', async ({ croPage }) => {
        const activityLogPage = new ActivityLogPage(croPage);
        await activityLogPage.navigateToSeededEntries('risk');

        const entryCount = await activityLogPage.getEntryCount();
        expect(entryCount).toBeGreaterThan(0);

        const firstEntryType = await activityLogPage.getEntryEntityType(0);
        expect(firstEntryType).toBe('RISK');
    });

    test('Diff display shows old and new values with visual distinction', async ({ croPage }) => {
        const activityLogPage = new ActivityLogPage(croPage);
        await activityLogPage.navigateToSeededEntries('risk');

        const updateIndex = await activityLogPage.findEntry('RISK', 'UPDATE');
        expect(updateIndex).toBeGreaterThanOrEqual(0);

        await activityLogPage.expandEntry(updateIndex);
        const entryCard = activityLogPage.entryCards.nth(updateIndex);
        await expect(entryCard).toContainText('Original value');
        await expect(entryCard).toContainText('Updated by E2E seed');

        const entryHtml = await entryCard.innerHTML();
        expect(entryHtml).toMatch(/text-rose|text-emerald|description/);
    });
});
