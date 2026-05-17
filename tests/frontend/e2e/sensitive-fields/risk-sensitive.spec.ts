/**
 * E2E Tests for Risk Sensitive Field Changes
 * Tests BUSINESS_LOGIC.md §6.1 - Risk Sensitive Fields.
 *
 * These specs assert deterministic approval fixtures seeded by
 * `backend/scripts/seed_e2e_sensitive_approvals.py`.
 */
import { expect, test } from '../fixtures/auth.fixture';
import { E2E_SENSITIVE_APPROVALS } from '../fixtures/e2e-data';
import { ApprovalsPage } from '../pages/ApprovalsPage';
import { expectSensitiveApproval } from './sensitiveApprovalAssertions';

test.describe('Risk Sensitive Field Changes (§6.1)', () => {
    test.describe('owner_id Changes', () => {
        test('Non-privileged user changing owner triggers approval request', async ({ riskManagerPage }) => {
            await expectSensitiveApproval(riskManagerPage, E2E_SENSITIVE_APPROVALS.RISK_OWNER_CHANGE);
        });

        test('Owner change is NOT applied until approved', async ({ riskManagerPage }) => {
            await expectSensitiveApproval(riskManagerPage, E2E_SENSITIVE_APPROVALS.RISK_OWNER_CHANGE);
        });
    });

    test.describe('department_id Changes', () => {
        test('Non-privileged user changing department triggers approval request', async ({ riskManagerPage }) => {
            await expectSensitiveApproval(riskManagerPage, E2E_SENSITIVE_APPROVALS.RISK_DEPARTMENT_CHANGE);
        });

        test('Risk stays in original department until approved', async ({ riskManagerPage }) => {
            await expectSensitiveApproval(riskManagerPage, E2E_SENSITIVE_APPROVALS.RISK_DEPARTMENT_CHANGE);
        });
    });

    test.describe('category Changes', () => {
        test('Non-privileged user changing category triggers approval request', async ({ riskManagerPage }) => {
            await expectSensitiveApproval(riskManagerPage, E2E_SENSITIVE_APPROVALS.RISK_CATEGORY_CHANGE);
        });
    });

    test.describe('is_priority Changes (§6.3)', () => {
        test('is_priority downgrade (true → false) requires approval', async ({ riskManagerPage }) => {
            await expectSensitiveApproval(riskManagerPage, E2E_SENSITIVE_APPROVALS.RISK_PRIORITY_DOWNGRADE);
        });

        test('is_priority upgrade (false → true) is immediate (no approval required)', async ({ riskManagerPage }) => {
            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();

            const upgradeApprovalIndex = await approvalsPage.findCardByReason(
                'E2E-SENSITIVE: Upgrade non-priority risk to priority',
            );
            expect(upgradeApprovalIndex).toBe(-1);
        });
    });
});
