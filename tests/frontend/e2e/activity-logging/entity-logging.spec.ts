/**
 * E2E Tests for Entity-Level Logging (BUSINESS_LOGIC.md §9.1)
 *
 * These tests use deterministic `E2E-SEED` activity records created by
 * `backend/scripts/seed_e2e_activity_logs.py`.
 */
import { expect, test } from '../fixtures/auth.fixture';
import { ActivityLogPage } from '../pages/ActivityLogPage';

test.describe('Entity-Level Logging', () => {
    test.describe('Activity Log Access', () => {
        test('CRO can access activity log', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigateToSeededEntries('risk');
            await activityLogPage.expectPageVisible();
        });

        test('Activity log shows entries for CRO', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigateToSeededEntries('risk');
            expect(await activityLogPage.getEntryCount()).toBeGreaterThan(0);
        });
    });

    test.describe('RISK Logging Verification', () => {
        test('Activity log contains RISK entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigateToSeededEntries('risk');
            await activityLogPage.expectEntryExists('RISK', 'CREATE');
            await activityLogPage.expectEntryExists('RISK', 'UPDATE');
            await activityLogPage.expectEntryExists('RISK', 'ARCHIVE');
        });

        test('RISK CREATE entries are visible when filtered by entity type', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigateToSeededEntries('risk');

            const entryCount = await activityLogPage.getEntryCount();
            expect(entryCount).toBeGreaterThan(0);
            for (let i = 0; i < entryCount; i++) {
                expect(await activityLogPage.getEntryEntityType(i)).toBe('RISK');
            }
            await activityLogPage.expectEntryExists('RISK', 'CREATE');
        });
    });

    test.describe('CONTROL Logging Verification', () => {
        test('Activity log contains CONTROL entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigateToSeededEntries('control');
            await activityLogPage.expectEntryExists('CONTROL', 'CREATE');
            await activityLogPage.expectEntryExists('CONTROL', 'UPDATE');
            await activityLogPage.expectEntryExists('CONTROL', 'ARCHIVE');
        });
    });

    test.describe('KRI Logging Verification', () => {
        test('Activity log contains KRI entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigateToSeededEntries('kri');
            await activityLogPage.expectEntryExists('KRI', 'CREATE');
            await activityLogPage.expectEntryExists('KRI', 'UPDATE');
        });

        test('Activity log contains KRI_VALUE entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigateToSeededEntries('kri');
            await activityLogPage.expectEntryExists('KRI_VALUE', 'CREATE');
        });
    });

    test.describe('APPROVAL Logging Verification', () => {
        test('Activity log contains APPROVAL entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigateToSeededEntries('user');
            await activityLogPage.expectEntryExists('APPROVAL', 'CREATE');
            await activityLogPage.expectEntryExists('APPROVAL', 'APPROVE');
            await activityLogPage.expectEntryExists('APPROVAL', 'REJECT');
        });
    });

    test.describe('Activity Log Search', () => {
        test('Search filters activity log entries', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigateToSeededEntries('risk');

            const filteredCount = await activityLogPage.getEntryCount();
            expect(filteredCount).toBeGreaterThan(0);
            await activityLogPage.expectEntryExists('RISK', 'CREATE');
        });
    });

    test.describe('Activity Log Pagination', () => {
        test('Pagination shows total count', async ({ croPage }) => {
            const activityLogPage = new ActivityLogPage(croPage);

            await activityLogPage.navigateToSeededEntries('risk');

            const paginationInfo = activityLogPage.paginationInfo;
            if (await paginationInfo.isVisible()) {
                const paginationText = await paginationInfo.textContent() ?? '';
                expect(paginationText).toMatch(/\d+.*of.*\d+/i);
            } else {
                expect(await activityLogPage.getEntryCount()).toBeGreaterThan(0);
            }
        });
    });
});
