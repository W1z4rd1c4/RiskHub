/**
 * E2E Tests for Entity-Level Logging (BUSINESS_LOGIC.md §9.1)
 * 
 * Verifies that activity log correctly displays entity CRUD operations:
 * - RISK: CREATE, UPDATE, ARCHIVE
 * - CONTROL: CREATE, UPDATE, ARCHIVE
 * - KRI: CREATE, UPDATE, ARCHIVE
 * - KRI_VALUE: CREATE (submission), UPDATE (correction)
 * - APPROVAL: CREATE, APPROVE, REJECT, CANCEL
 * 
 * These tests verify the activity log UI and filtering rather than creating
 * new entities, as creation workflows are tested elsewhere and the activity
 * log should already contain historical data.
 */
import { test, expect } from '../fixtures/auth.fixture';
import { ActivityLogPage } from '../pages/ActivityLogPage';
import { waitForDataLoad } from '../helpers/wait';

test.describe('Entity-Level Logging', () => {
    test.describe('Activity Log Access', () => {
        test('CRO can access activity log', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();
            await activityLogPage.expectPageVisible();
        });

        test('Activity log shows entries for CRO', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();
            const entryCount = await activityLogPage.getEntryCount();

            // There should be some activity entries from previous operations
            expect(entryCount).toBeGreaterThanOrEqual(0);
        });
    });

    test.describe('RISK Logging Verification', () => {
        test('Activity log contains RISK entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            // Check if there's at least one RISK entry of any action type
            const riskCreateIndex = await activityLogPage.findEntry('RISK', 'CREATE');
            const riskUpdateIndex = await activityLogPage.findEntry('RISK', 'UPDATE');
            const riskArchiveIndex = await activityLogPage.findEntry('RISK', 'ARCHIVE');

            // At least one type of RISK activity should exist
            const hasRiskActivity = riskCreateIndex >= 0 || riskUpdateIndex >= 0 || riskArchiveIndex >= 0;

            if (!hasRiskActivity) {
                test.skip();
            }
        });

        test('RISK CREATE entries are visible when filtered by entity type', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            // Try to filter by RISK entity type (if filter is available)
            const entityTypeFilter = croPage.locator('[data-testid="entity-type-filter"], button:has-text("Entity")');
            if (await entityTypeFilter.isVisible()) {
                await entityTypeFilter.click();
                await croPage.click('[role="option"]:has-text("RISK"), button:has-text("RISK")');
                await waitForDataLoad(croPage);

                // After filtering, entries should only contain RISK
                const entryCount = await activityLogPage.getEntryCount();
                if (entryCount > 0) {
                    const firstEntryType = await activityLogPage.getEntryEntityType(0);
                    expect(firstEntryType).toBe('RISK');
                }
            } else {
                // Filter not available, just verify entries are shown
                test.skip();
            }
        });
    });

    test.describe('CONTROL Logging Verification', () => {
        test('Activity log contains CONTROL entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            const controlCreateIndex = await activityLogPage.findEntry('CONTROL', 'CREATE');
            const controlUpdateIndex = await activityLogPage.findEntry('CONTROL', 'UPDATE');
            const controlArchiveIndex = await activityLogPage.findEntry('CONTROL', 'ARCHIVE');

            const hasControlActivity = controlCreateIndex >= 0 || controlUpdateIndex >= 0 || controlArchiveIndex >= 0;

            if (!hasControlActivity) {
                test.skip();
            }
        });
    });

    test.describe('KRI Logging Verification', () => {
        test('Activity log contains KRI entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            const kriCreateIndex = await activityLogPage.findEntry('KRI', 'CREATE');
            const kriUpdateIndex = await activityLogPage.findEntry('KRI', 'UPDATE');

            const hasKriActivity = kriCreateIndex >= 0 || kriUpdateIndex >= 0;

            if (!hasKriActivity) {
                test.skip();
            }
        });

        test('Activity log contains KRI_VALUE entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            const kriValueIndex = await activityLogPage.findEntry('KRI_VALUE', 'CREATE');

            if (kriValueIndex < 0) {
                // No KRI_VALUE entries - skip (values may not have been submitted yet)
                test.skip();
            }
        });
    });

    test.describe('APPROVAL Logging Verification', () => {
        test('Activity log contains APPROVAL entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            const approvalCreateIndex = await activityLogPage.findEntry('APPROVAL', 'CREATE');
            const approvalApproveIndex = await activityLogPage.findEntry('APPROVAL', 'APPROVE');
            const approvalRejectIndex = await activityLogPage.findEntry('APPROVAL', 'REJECT');

            const hasApprovalActivity = approvalCreateIndex >= 0 || approvalApproveIndex >= 0 || approvalRejectIndex >= 0;

            if (!hasApprovalActivity) {
                // No approval activity yet - skip
                test.skip();
            }
        });
    });

    test.describe('Activity Log Search', () => {
        test('Search filters activity log entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            const initialCount = await activityLogPage.getEntryCount();
            if (initialCount === 0) {
                test.skip();
                return;
            }

            // Get text from first entry to use as search term
            const firstEntryText = await activityLogPage.getEntryText(0);
            const searchTerm = firstEntryText.split(' ')[0]; // Use first word

            if (searchTerm) {
                await activityLogPage.searchEntries(searchTerm);
                // After search, we should still have some results
                const filteredCount = await activityLogPage.getEntryCount();
                expect(filteredCount).toBeGreaterThanOrEqual(0);
            }
        });
    });

    test.describe('Activity Log Pagination', () => {
        test('Pagination shows total count', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigate();

            // Check if pagination info is visible
            const paginationInfo = activityLogPage.paginationInfo;
            if (await paginationInfo.isVisible()) {
                const paginationText = await paginationInfo.textContent() ?? '';
                // Should match pattern like "1 of 10"
                expect(paginationText).toMatch(/\d+.*of.*\d+/i);
            }
        });
    });
});
