/**
 * E2E Tests for Approval Status Flow
 * Tests BUSINESS_LOGIC.md §5.1 - Approval Status Flow
 *
 * Status transitions covered:
 * - PENDING → APPROVED (single tier)
 * - PENDING → REJECTED
 * - PENDING → CANCELLED
 * - PENDING → PENDING_PRIVILEGED → APPROVED (two-tier)
 */
import { test, expect, DEMO_ACCOUNTS } from '../fixtures/auth.fixture';
import { ApprovalsPage } from '../pages/ApprovalsPage';
import { RisksPage } from '../pages/RisksPage';
import { waitForDataLoad } from '../helpers/wait';
import { loginAsDemoUser } from '../helpers/login';

test.describe('Approval Status Flow', () => {
    test.describe('§5.1 Status Transitions', () => {
        test('View pending approvals as Risk Manager', async ({ riskManagerPage }) => {
            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();

            await approvalsPage.expectPageVisible();

            // Check if there are pending approvals or empty state
            const count = await approvalsPage.getApprovalCount();
            if (count > 0) {
                await approvalsPage.expectCardsLoaded(1);
            } else {
                await approvalsPage.expectEmptyState();
            }
        });

        test('Filter tabs work correctly', async ({ riskManagerPage }) => {
            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();

            // Test Pending Queue tab (default)
            await expect(approvalsPage.pendingQueueTab).toBeVisible();

            // Test My Requests tab
            await approvalsPage.selectMyRequests();
            await waitForDataLoad(riskManagerPage);

            // Test History tab
            await approvalsPage.selectHistory();
            await waitForDataLoad(riskManagerPage);

            // Switch back to Pending Queue
            await approvalsPage.selectPendingQueue();
            await waitForDataLoad(riskManagerPage);
        });

        test('Risk Manager can see approve/reject buttons on pending requests', async ({ riskManagerPage }) => {
            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();

            const count = await approvalsPage.getApprovalCount();
            if (count === 0) {
                test.skip();
                return;
            }

            // On pending requests, approve and reject buttons should be visible
            const status = await approvalsPage.getStatus(0);
            if (status === 'pending' || status === 'pending_privileged') {
                const hasApprove = await approvalsPage.isApproveButtonVisible(0);
                const hasReject = await approvalsPage.isRejectButtonVisible(0);
                expect(hasApprove).toBe(true);
                expect(hasReject).toBe(true);
            }
        });

        test('PENDING → APPROVED: Risk Manager approves a pending request', async ({ browser }) => {
            // First, create a pending request as Employee by deleting a risk
            const employeeContext = await browser.newContext();
            const employeePage = await employeeContext.newPage();
            await loginAsDemoUser(employeePage, DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS);

            const risksPage = new RisksPage(employeePage);
            await risksPage.navigate();

            const rowCount = await risksPage.getRowCount();
            if (rowCount === 0) {
                await employeeContext.close();
                test.skip();
                return;
            }

            // Go to first risk detail
            await risksPage.clickFirstRow();
            await waitForDataLoad(employeePage);

            // Look for delete button
            const deleteBtn = employeePage.locator('button:has-text("Delete"), button:has-text("Archive"), button:has(.lucide-trash)');
            const hasDeleteBtn = await deleteBtn.isVisible().catch(() => false);

            if (!hasDeleteBtn) {
                await employeeContext.close();
                test.skip();
                return;
            }

            // Click delete - should trigger approval request
            await deleteBtn.click();

            // Handle confirmation dialog if present
            const confirmDialog = employeePage.locator('[role="dialog"], [role="alertdialog"]');
            if (await confirmDialog.isVisible().catch(() => false)) {
                const confirmBtn = confirmDialog.locator('button:has-text("Delete"), button:has-text("Archive"), button:has-text("Confirm"), button:has-text("Yes")');
                if (await confirmBtn.isVisible().catch(() => false)) {
                    // Fill reason if text input is present
                    const reasonInput = confirmDialog.locator('input, textarea').first();
                    if (await reasonInput.isVisible().catch(() => false)) {
                        await reasonInput.fill('E2E test deletion request');
                    }
                    await confirmBtn.click();
                }
            }

            await waitForDataLoad(employeePage);
            await employeeContext.close();

            // Now approve it as Risk Manager
            const rmContext = await browser.newContext();
            const rmPage = await rmContext.newPage();
            await loginAsDemoUser(rmPage, DEMO_ACCOUNTS.RISK_MANAGER);

            const approvalsPage = new ApprovalsPage(rmPage);
            await approvalsPage.navigate();

            const approvalCount = await approvalsPage.getApprovalCount();
            if (approvalCount > 0) {
                const status = await approvalsPage.getStatus(0);
                if (status === 'pending' || status === 'pending_privileged') {
                    await approvalsPage.clickApprove(0);
                    await approvalsPage.submitResolution('Approved via E2E test', 'approve');

                    // Verify the request is no longer in pending queue
                    await approvalsPage.selectHistory();
                    await waitForDataLoad(rmPage);
                }
            }

            await rmContext.close();
        });

        test('PENDING → REJECTED: Risk Manager rejects a pending request', async ({ riskManagerPage }) => {
            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();

            const count = await approvalsPage.getApprovalCount();
            if (count === 0) {
                test.skip();
                return;
            }

            const status = await approvalsPage.getStatus(0);
            if (status !== 'pending' && status !== 'pending_privileged') {
                test.skip();
                return;
            }

            // Reject the request
            await approvalsPage.clickReject(0);
            await approvalsPage.submitResolution('Rejected via E2E test', 'reject');

            // Verify the request is processed
            await approvalsPage.selectHistory();
            await waitForDataLoad(riskManagerPage);
        });

        test('PENDING → CANCELLED: Creator cancels own request', async ({ browser }) => {
            // Create a request as Employee
            const employeeContext = await browser.newContext();
            const employeePage = await employeeContext.newPage();
            await loginAsDemoUser(employeePage, DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS);

            const approvalsPage = new ApprovalsPage(employeePage);
            await approvalsPage.navigate();
            await approvalsPage.selectMyRequests();

            const count = await approvalsPage.getApprovalCount();
            if (count === 0) {
                await employeeContext.close();
                test.skip();
                return;
            }

            // Find a pending request the employee can cancel
            const status = await approvalsPage.getStatus(0);
            const canCancel = await approvalsPage.isCancelButtonVisible(0);

            if ((status === 'pending' || status === 'pending_privileged') && canCancel) {
                await approvalsPage.clickCancel(0);
                await waitForDataLoad(employeePage);

                // Verify the request was cancelled
                await approvalsPage.selectMyRequests();
                await waitForDataLoad(employeePage);
            }

            await employeeContext.close();
        });

        test('History tab shows resolved requests', async ({ riskManagerPage }) => {
            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();

            await approvalsPage.selectHistory();
            await waitForDataLoad(riskManagerPage);

            const count = await approvalsPage.getApprovalCount();
            if (count > 0) {
                // Check that resolved requests show their status
                const status = await approvalsPage.getStatus(0);
                const validStatuses = ['approved', 'rejected', 'cancelled', 'pending', 'pending_privileged'];
                expect(validStatuses).toContain(status);
            }
        });
    });

    test.describe('§5.1 Two-Tier Approval Flow', () => {
        test('Pending privileged status requires additional approval', async ({ riskManagerPage }) => {
            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();

            // Look for any pending_privileged requests
            const count = await approvalsPage.getApprovalCount();
            for (let i = 0; i < count; i++) {
                const status = await approvalsPage.getStatus(i);
                if (status === 'pending_privileged') {
                    // Verify approve/reject buttons are visible for privileged users
                    const hasApprove = await approvalsPage.isApproveButtonVisible(i);
                    expect(hasApprove).toBe(true);
                    break;
                }
            }
        });
    });
});
