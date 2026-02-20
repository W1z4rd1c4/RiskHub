import { test, expect } from '../fixtures/auth.fixture';
import { E2E_APPROVALS } from '../fixtures/e2e-data';
import { ApprovalsPage } from '../pages/ApprovalsPage';

test.describe('Approval Status Flow (Deterministic)', () => {
    test('Risk Manager sees seeded pending approval requests', async ({ riskManagerPage }) => {
        const approvalsPage = new ApprovalsPage(riskManagerPage);
        await approvalsPage.navigate();
        await approvalsPage.expectPageVisible();

        const pendingDeleteIndex = await approvalsPage.findCardByReason(
            E2E_APPROVALS.PENDING_RISK_DELETE.reason,
        );
        expect(pendingDeleteIndex).toBeGreaterThanOrEqual(0);
        await approvalsPage.expectStatus(pendingDeleteIndex, E2E_APPROVALS.PENDING_RISK_DELETE.status);
    });

    test('Risk Manager sees pending privileged seeded request', async ({ riskManagerPage }) => {
        const approvalsPage = new ApprovalsPage(riskManagerPage);
        await approvalsPage.navigate();

        const privilegedIndex = await approvalsPage.findCardByReason(
            E2E_APPROVALS.PENDING_PRIVILEGED_EDIT.reason,
        );
        expect(privilegedIndex).toBeGreaterThanOrEqual(0);

        const status = await approvalsPage.getStatus(privilegedIndex);
        expect(status).toBe(E2E_APPROVALS.PENDING_PRIVILEGED_EDIT.status);
        await expect(approvalsPage.getCard(privilegedIndex).locator('button[title="Approve"]')).toBeVisible();
    });

    test('Employee My Requests tab shows seeded request created by employee', async ({ employeePage }) => {
        const approvalsPage = new ApprovalsPage(employeePage);
        await approvalsPage.navigate();
        await approvalsPage.selectMyRequests();

        const cardIndex = await approvalsPage.findCardByReason(E2E_APPROVALS.PENDING_RISK_DELETE.reason);
        expect(cardIndex).toBeGreaterThanOrEqual(0);
    });

    test('History tab is accessible and status values are valid', async ({ riskManagerPage }) => {
        const approvalsPage = new ApprovalsPage(riskManagerPage);
        await approvalsPage.navigate();
        await approvalsPage.selectHistory();

        const count = await approvalsPage.getApprovalCount();
        if (count === 0) {
            // History can be empty on a fresh DB; deterministic and acceptable.
            expect(count).toBe(0);
            return;
        }

        const status = await approvalsPage.getStatus(0);
        expect(['approved', 'rejected', 'cancelled', 'pending', 'pending_privileged']).toContain(status);
    });
});
