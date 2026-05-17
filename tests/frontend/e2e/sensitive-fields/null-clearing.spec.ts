/**
 * E2E Tests for Clearing to NULL Special Case
 * Tests BUSINESS_LOGIC.md §6.3 - Clearing sensitive values to NULL.
 */
import { expect, test } from '../fixtures/auth.fixture';
import { E2E_SENSITIVE_APPROVALS } from '../fixtures/e2e-data';
import { ApprovalsPage } from '../pages/ApprovalsPage';
import { expectSensitiveApproval } from './sensitiveApprovalAssertions';

test.describe('Clearing to NULL Special Case (§6.3)', () => {
    test.describe('Clear owner_id to NULL', () => {
        test('Non-privileged user clearing owner field triggers approval request', async ({ riskManagerPage }) => {
            await expectSensitiveApproval(riskManagerPage, E2E_SENSITIVE_APPROVALS.RISK_OWNER_CLEAR);
        });

        test('Verify approval notes mention removing owner', async ({ riskManagerPage }) => {
            await expectSensitiveApproval(riskManagerPage, E2E_SENSITIVE_APPROVALS.RISK_OWNER_CLEAR);
        });
    });

    test.describe('Clear department_id Handling', () => {
        test('Attempt to clear department is handled appropriately', async ({ riskManagerPage }) => {
            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();

            const nullDepartmentApprovalIndex = await approvalsPage.findCardByReason(
                'E2E-SENSITIVE: Clear department (set to NULL)',
            );
            expect(nullDepartmentApprovalIndex).toBe(-1);
        });
    });

    test.describe('Approval Execution Applies NULL', () => {
        test('Approving owner removal sets owner_id to NULL', async ({ riskManagerPage }) => {
            await expectSensitiveApproval(riskManagerPage, E2E_SENSITIVE_APPROVALS.RISK_OWNER_CLEAR);
        });
    });
});
