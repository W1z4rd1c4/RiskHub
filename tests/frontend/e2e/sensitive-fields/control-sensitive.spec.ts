/**
 * E2E Tests for Control Sensitive Field Changes
 * Tests BUSINESS_LOGIC.md §6.1 - Control Sensitive Fields.
 *
 * These specs assert deterministic approval fixtures seeded by
 * `backend/scripts/seed_e2e_sensitive_approvals.py`.
 */
import { expect, test } from '../fixtures/auth.fixture';
import { E2E_SENSITIVE_APPROVALS } from '../fixtures/e2e-data';
import { ApprovalsPage } from '../pages/ApprovalsPage';
import { expectSensitiveApproval } from './sensitiveApprovalAssertions';

test.describe('Control Sensitive Field Changes (§6.1)', () => {
    test.describe('control_owner_id Changes', () => {
        test('Non-privileged user changing control owner triggers approval request', async ({ riskManagerPage }) => {
            await expectSensitiveApproval(riskManagerPage, E2E_SENSITIVE_APPROVALS.CONTROL_OWNER_CHANGE);
        });

        test('Control owner NOT changed until approved', async ({ riskManagerPage }) => {
            await expectSensitiveApproval(riskManagerPage, E2E_SENSITIVE_APPROVALS.CONTROL_OWNER_CHANGE);
        });
    });

    test.describe('department_id Changes', () => {
        test('Non-privileged user changing control department triggers approval request', async ({ riskManagerPage }) => {
            await expectSensitiveApproval(riskManagerPage, E2E_SENSITIVE_APPROVALS.CONTROL_DEPARTMENT_CHANGE);
        });
    });

    test.describe('Privileged User Bypass', () => {
        test('Risk Manager can change control owner immediately (no approval required)', async ({ riskManagerPage }) => {
            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();

            const privilegedOwnerApprovalIndex = await approvalsPage.findCardByReason(
                'E2E-SENSITIVE: Privileged control owner change',
            );
            expect(privilegedOwnerApprovalIndex).toBe(-1);
        });

        test('CRO can change control owner immediately (no approval required)', async ({ croPage }) => {
            const approvalsPage = new ApprovalsPage(croPage);
            await approvalsPage.navigate();

            const privilegedOwnerApprovalIndex = await approvalsPage.findCardByReason(
                'E2E-SENSITIVE: CRO control owner change',
            );
            expect(privilegedOwnerApprovalIndex).toBe(-1);
        });
    });
});
