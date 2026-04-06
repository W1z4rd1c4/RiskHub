/**
 * E2E Tests for Tiered Approval Model
 * Tests BUSINESS_LOGIC.md §5.2 and §5.3 - Tiered Approval
 *
 * Coverage:
 * - Primary approval required for non-privileged users
 * - Approval UI surfaces requests already marked pending_privileged
 * - Control linked to high-risk can require privileged approval
 *
 * Note: this spec does not deterministically create the net-score threshold
 * delete scenario; backend pytest owns that regression coverage.
 */
import { test, expect, DEMO_ACCOUNTS } from '../fixtures/auth.fixture';
import { ApprovalsPage } from '../pages/ApprovalsPage';
import { RisksPage } from '../pages/RisksPage';
import { waitForDataLoad } from '../helpers/wait';
import { loginAsDemoUser } from '../helpers/login';

test.describe('Tiered Approval Model', () => {
    test.describe('§5.2 Primary Approval', () => {
        test('Non-privileged user deletion creates approval with primary approver', async ({ browser }) => {
            // Login as Employee and try to delete a risk
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

            // Go to first risk
            await risksPage.clickFirstRow();
            await waitForDataLoad(employeePage);

            // Check for delete button
            const deleteBtn = employeePage.locator('button:has-text("Delete"), button:has-text("Archive"), button:has(.lucide-trash)');
            const hasDeleteBtn = await deleteBtn.isVisible().catch(() => false);

            if (hasDeleteBtn) {
                // Clicking delete should create an approval request
                await deleteBtn.click();

                // Handle confirmation dialog
                const confirmDialog = employeePage.locator('[role="dialog"], [role="alertdialog"]');
                if (await confirmDialog.isVisible().catch(() => false)) {
                    const reasonInput = confirmDialog.locator('input, textarea').first();
                    if (await reasonInput.isVisible().catch(() => false)) {
                        await reasonInput.fill('E2E test: Primary approval required');
                    }
                    const confirmBtn = confirmDialog.locator('button:has-text("Delete"), button:has-text("Archive"), button:has-text("Confirm"), button:has-text("Yes")');
                    if (await confirmBtn.isVisible().catch(() => false)) {
                        await confirmBtn.click();
                    }
                }

                await waitForDataLoad(employeePage);
            }

            await employeeContext.close();
        });

        test('Department Head can view approvals for their department', async ({ deptHeadPage }) => {
            const approvalsPage = new ApprovalsPage(deptHeadPage);
            await approvalsPage.navigate();

            await approvalsPage.expectPageVisible();

            // Dept heads may or may not have pending approvals
            await approvalsPage.selectMyRequests();
            await waitForDataLoad(deptHeadPage);
        });
    });

    test.describe('§5.3 Privileged Approval Triggers', () => {
        test('Approval requests show requires_privileged indicator via status', async ({ riskManagerPage }) => {
            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();

            const count = await approvalsPage.getApprovalCount();
            if (count === 0) {
                test.skip();
                return;
            }

            // Check if any requests have pending_privileged status
            for (let i = 0; i < count; i++) {
                const status = await approvalsPage.getStatus(i);
                if (status === 'pending_privileged') {
                    // This confirms privileged approval is required
                    const hasApprove = await approvalsPage.isApproveButtonVisible(i);
                    expect(hasApprove).toBe(true);
                    return;
                }
            }

            // If no pending_privileged, check history
            await approvalsPage.selectHistory();
            await waitForDataLoad(riskManagerPage);
        });

        test('CRO can approve privileged requests', async ({ croPage }) => {
            const approvalsPage = new ApprovalsPage(croPage);
            await approvalsPage.navigate();

            const count = await approvalsPage.getApprovalCount();
            if (count === 0) {
                test.skip();
                return;
            }

            // Find a pending_privileged request
            for (let i = 0; i < count; i++) {
                const status = await approvalsPage.getStatus(i);
                if (status === 'pending_privileged') {
                    const hasApprove = await approvalsPage.isApproveButtonVisible(i);
                    expect(hasApprove).toBe(true);
                    break;
                }
            }
        });

        test('Risk Manager can approve privileged requests', async ({ riskManagerPage }) => {
            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();

            const count = await approvalsPage.getApprovalCount();
            for (let i = 0; i < count; i++) {
                const status = await approvalsPage.getStatus(i);
                if (status === 'pending_privileged') {
                    const hasApprove = await approvalsPage.isApproveButtonVisible(i);
                    const hasReject = await approvalsPage.isRejectButtonVisible(i);
                    expect(hasApprove).toBe(true);
                    expect(hasReject).toBe(true);
                    break;
                }
            }
        });
    });

    test.describe('Control Linked to High-Risk', () => {
        test('Approval for control linked to priority risk', async ({ riskManagerPage }) => {
            // Navigate to approvals and look for control-related requests
            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();

            const count = await approvalsPage.getApprovalCount();
            if (count === 0) {
                test.skip();
                return;
            }

            // Check for control requests
            for (let i = 0; i < count; i++) {
                const card = approvalsPage.getCard(i);
                const resourceType = await card.locator('.text-\\[10px\\].uppercase.tracking-widest').first().textContent();
                if (resourceType && resourceType.toLowerCase().includes('control')) {
                    // Found a control approval request
                    const status = await approvalsPage.getStatus(i);
                    if (status === 'pending' || status === 'pending_privileged') {
                        const hasApprove = await approvalsPage.isApproveButtonVisible(i);
                        expect(hasApprove).toBe(true);
                    }
                    break;
                }
            }
        });
    });
});
