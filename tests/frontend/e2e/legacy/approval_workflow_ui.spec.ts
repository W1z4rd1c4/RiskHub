
import { test, expect } from '@playwright/test';
import { DEMO_ACCOUNTS, loginAsDemoUser, logout } from '../helpers/login';
import { ApprovalsPage } from '../pages/ApprovalsPage';

test('Approval Workflow UI Verification', async ({ page }) => {
    // 1. Login as an employee and verify approvals UI loads.
    await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS, { retries: 4, timeout: 20000 });
    const employeeApprovals = new ApprovalsPage(page);
    await employeeApprovals.navigate();
    await employeeApprovals.expectPageVisible();
    await employeeApprovals.selectMyRequests();
    const employeeMyRequestCount = await employeeApprovals.getApprovalCount();
    expect(employeeMyRequestCount).toBeGreaterThanOrEqual(0);

    // 2. Login as Risk Manager and verify actionable approval controls are visible.
    await logout(page);
    await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER, { retries: 4, timeout: 20000 });
    const riskManagerApprovals = new ApprovalsPage(page);
    await riskManagerApprovals.navigate();
    await riskManagerApprovals.expectPageVisible();

    const totalApprovals = await riskManagerApprovals.getApprovalCount();
    expect(totalApprovals).toBeGreaterThan(0);

    let pendingCards = 0;
    let actionablePendingFound = false;

    for (let i = 0; i < totalApprovals; i++) {
        const status = await riskManagerApprovals.getStatus(i);
        if (status === 'pending' || status === 'pending_privileged') {
            pendingCards += 1;
            const canApprove = await riskManagerApprovals.isApproveButtonVisible(i);
            const canReject = await riskManagerApprovals.isRejectButtonVisible(i);
            if (canApprove || canReject) {
                actionablePendingFound = true;
                break;
            }
        }
    }

    if (pendingCards > 0) {
        expect(actionablePendingFound).toBeTruthy();
    }
});
