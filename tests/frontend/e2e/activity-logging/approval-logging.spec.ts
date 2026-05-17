/**
 * E2E Tests for Approval Execution Logging (BUSINESS_LOGIC.md §9.3)
 *
 * The deterministic E2E seed includes approval lifecycle activity records with
 * `E2E-SEED` descriptions. These tests verify those seeded audit records
 * through the Activity Log UI instead of depending on previous test order.
 */
import { expect, test } from '../fixtures/auth.fixture';
import { ActivityLogPage } from '../pages/ActivityLogPage';

test.describe('Approval Execution Logging', () => {
    test.describe('APPROVAL Entity Logging', () => {
        test('Activity log contains APPROVAL CREATE entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);
            await activityLogPage.navigateToSeededEntries('user');

            const approvalCreateIndex = await activityLogPage.findEntry('APPROVAL', 'CREATE');
            expect(approvalCreateIndex).toBeGreaterThanOrEqual(0);
            await expect(activityLogPage.entryCards.nth(approvalCreateIndex)).toContainText(/approval/i);
        });

        test('Activity log contains APPROVAL APPROVE entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);
            await activityLogPage.navigateToSeededEntries('user');

            const approvalApproveIndex = await activityLogPage.findEntry('APPROVAL', 'APPROVE');
            expect(approvalApproveIndex).toBeGreaterThanOrEqual(0);
            await expect(activityLogPage.entryCards.nth(approvalApproveIndex)).toContainText(/approved/i);
        });

        test('Activity log contains APPROVAL REJECT entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);
            await activityLogPage.navigateToSeededEntries('user');

            const approvalRejectIndex = await activityLogPage.findEntry('APPROVAL', 'REJECT');
            expect(approvalRejectIndex).toBeGreaterThanOrEqual(0);
            await expect(activityLogPage.entryCards.nth(approvalRejectIndex)).toContainText(/rejected/i);
        });

        test('Activity log contains APPROVAL CANCEL entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);
            await activityLogPage.navigateToSeededEntries('user');

            const approvalCancelIndex = await activityLogPage.findEntry('APPROVAL', 'CANCEL');
            expect(approvalCancelIndex).toBeGreaterThanOrEqual(0);
            await expect(activityLogPage.entryCards.nth(approvalCancelIndex)).toContainText(/cancelled/i);
        });
    });

    test.describe('Underlying Entity Logging', () => {
        test('ARCHIVE entries exist in activity log', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);
            await activityLogPage.navigateToSeededEntries('risk');

            await activityLogPage.expectEntryExists('RISK', 'ARCHIVE');

            await activityLogPage.selectTab('control');
            await activityLogPage.searchEntries('E2E-SEED');
            await activityLogPage.expectEntryExists('CONTROL', 'ARCHIVE');
        });

        test('ARCHIVE entries contain resource information', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);
            await activityLogPage.navigateToSeededEntries('risk');

            const archiveIndex = await activityLogPage.findEntry('RISK', 'ARCHIVE');
            expect(archiveIndex).toBeGreaterThanOrEqual(0);

            const entryText = await activityLogPage.getEntryText(archiveIndex);
            expect(entryText).toMatch(/archived/i);
            expect(entryText.length).toBeGreaterThan(10);
        });
    });
});
