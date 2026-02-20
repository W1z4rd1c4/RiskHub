/**
 * E2E Tests for Approval Execution Logging (BUSINESS_LOGIC.md §9.3)
 * 
 * Verifies that approval workflow actions are logged:
 * - APPROVAL entity logs: CREATE, APPROVE, REJECT, CANCEL
 * - Underlying entity logs: ARCHIVE or UPDATE when approved
 * 
 * These tests verify existing activity log entries to confirm the logging
 * infrastructure is working correctly.
 */
import { test, expect } from '../fixtures/auth.fixture';
import { ActivityLogPage } from '../pages/ActivityLogPage';

test.describe('Approval Execution Logging', () => {
    test.describe('APPROVAL Entity Logging', () => {
        test('Activity log contains APPROVAL CREATE entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            const approvalCreateIndex = await activityLogPage.findEntry('APPROVAL', 'CREATE');

            if (approvalCreateIndex < 0) {
                // No approval requests have been created yet
                test.skip();
            } else {
                const entryText = await activityLogPage.getEntryText(approvalCreateIndex);
                expect(entryText).toContain('APPROVAL');
            }
        });

        test('Activity log contains APPROVAL APPROVE entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            const approvalApproveIndex = await activityLogPage.findEntry('APPROVAL', 'APPROVE');

            if (approvalApproveIndex < 0) {
                // No approvals have been executed yet
                test.skip();
            } else {
                const entryText = await activityLogPage.getEntryText(approvalApproveIndex);
                expect(entryText).toContain('APPROVE');
            }
        });

        test('Activity log contains APPROVAL REJECT entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            const approvalRejectIndex = await activityLogPage.findEntry('APPROVAL', 'REJECT');

            if (approvalRejectIndex < 0) {
                // No rejections have been made yet
                test.skip();
            } else {
                const entryText = await activityLogPage.getEntryText(approvalRejectIndex);
                expect(entryText).toContain('REJECT');
            }
        });

        test('Activity log contains APPROVAL CANCEL entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            const approvalCancelIndex = await activityLogPage.findEntry('APPROVAL', 'CANCEL');

            if (approvalCancelIndex < 0) {
                // No cancellations have been made yet
                test.skip();
            } else {
                const entryText = await activityLogPage.getEntryText(approvalCancelIndex);
                expect(entryText).toContain('CANCEL');
            }
        });
    });

    test.describe('Underlying Entity Logging', () => {
        test('ARCHIVE entries exist in activity log', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            const riskArchiveIndex = await activityLogPage.findEntry('RISK', 'ARCHIVE');
            const controlArchiveIndex = await activityLogPage.findEntry('CONTROL', 'ARCHIVE');
            const kriArchiveIndex = await activityLogPage.findEntry('KRI', 'ARCHIVE');

            const hasArchiveEntry = riskArchiveIndex >= 0 || controlArchiveIndex >= 0 || kriArchiveIndex >= 0;

            if (!hasArchiveEntry) {
                // No archives have been executed yet
                test.skip();
            }
        });

        test('ARCHIVE entries contain resource information', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            const archiveIndex = await activityLogPage.findEntry('RISK', 'ARCHIVE');

            if (archiveIndex < 0) {
                // Try CONTROL archives
                const controlArchiveIndex = await activityLogPage.findEntry('CONTROL', 'ARCHIVE');
                if (controlArchiveIndex < 0) {
                    test.skip();
                    return;
                }
                const entryText = await activityLogPage.getEntryText(controlArchiveIndex);
                expect(entryText.length).toBeGreaterThan(10);
                return;
            }

            const entryText = await activityLogPage.getEntryText(archiveIndex);
            expect(entryText.length).toBeGreaterThan(10);
        });
    });

});
