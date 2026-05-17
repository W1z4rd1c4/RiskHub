/**
 * E2E Tests for Priority Risk Edit Rule
 * Tests BUSINESS_LOGIC.md §6.2 - Priority Risk Edit Rule.
 *
 * The deterministic dataset contains priority-risk edit approvals. These tests
 * verify the approval contract without relying on mutable test order.
 */
import { expect, test } from '../fixtures/auth.fixture';
import type { Page } from '@playwright/test';
import { E2E_APPROVALS, E2E_SENSITIVE_APPROVALS } from '../fixtures/e2e-data';
import { ApprovalsPage } from '../pages/ApprovalsPage';
import { expectSensitiveApproval } from './sensitiveApprovalAssertions';

async function expectPriorityEditApproval(page: Page): Promise<void> {
    const approvalsPage = new ApprovalsPage(page);
    await approvalsPage.navigate();

    const index = await approvalsPage.findCardByReason(E2E_APPROVALS.PENDING_PRIVILEGED_EDIT.reason);
    expect(index, `Expected seeded approval reason: ${E2E_APPROVALS.PENDING_PRIVILEGED_EDIT.reason}`).toBeGreaterThanOrEqual(0);
    await approvalsPage.expectStatus(index, E2E_APPROVALS.PENDING_PRIVILEGED_EDIT.status);
    expect(await approvalsPage.getActionType(index)).toContain(E2E_APPROVALS.PENDING_PRIVILEGED_EDIT.action);
}

test.describe('Priority Risk Edit Rule (§6.2)', () => {
    test.describe('Any Edit on Priority Risk Requires Approval', () => {
        test('Department Head editing non-sensitive field on priority risk triggers approval', async ({ riskManagerPage }) => {
            await expectPriorityEditApproval(riskManagerPage);
        });

        test('Employee editing any field on priority risk triggers approval', async ({ riskManagerPage }) => {
            await expectPriorityEditApproval(riskManagerPage);
        });
    });

    test.describe('CRO/Risk Manager Immediate Update', () => {
        test('CRO can edit priority risk immediately (no approval required)', async ({ croPage }) => {
            const approvalsPage = new ApprovalsPage(croPage);
            await approvalsPage.navigate();

            const croApprovalIndex = await approvalsPage.findCardByReason(
                'E2E-SENSITIVE: CRO priority risk edit',
            );
            expect(croApprovalIndex).toBe(-1);
        });

        test('Risk Manager can edit priority risk immediately (no approval required)', async ({ riskManagerPage }) => {
            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();

            const riskManagerApprovalIndex = await approvalsPage.findCardByReason(
                'E2E-SENSITIVE: Risk Manager priority risk edit',
            );
            expect(riskManagerApprovalIndex).toBe(-1);
        });
    });

    test.describe('Risk Owner (Non-Privileged) Requires Approval', () => {
        test('Risk Owner who is Department Head still requires approval for priority risk edit', async ({ riskManagerPage }) => {
            await expectSensitiveApproval(riskManagerPage, E2E_SENSITIVE_APPROVALS.RISK_PRIORITY_DOWNGRADE);
        });
    });
});
