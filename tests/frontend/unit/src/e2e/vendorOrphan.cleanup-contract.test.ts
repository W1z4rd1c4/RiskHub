import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), '../tests/frontend/e2e/vendors.spec.ts'), 'utf8');
const journeyStart = source.indexOf("test('Vendor orphan reassignment remains pending until independent approval'");
const journey = source.slice(journeyStart);
const cleanupHook = source.slice(source.indexOf('test.afterEach('), journeyStart);
const cancellation = source.slice(
    source.indexOf('async function cancelVendorOrphanFixtureApprovals'),
    source.indexOf('async function ensureDedicatedVendorOwner'),
);

describe('Vendor orphan E2E cleanup contract', () => {
    it('limits fallback cancellation to the unique reason, exact Vendor and CRO requester', () => {
        expect(cancellation).toContain("my_requests: 'true', resource_type: 'vendor'");
        expect(cancellation).toContain("item.resource_type === 'vendor' && item.resource_id === vendorId");
        expect(cancellation).toContain("item.requested_by_email === 'cro@riskhub.local'");
        expect(cancellation).toContain('item.reason === reason');
        expect(cancellation).toContain("['pending', 'pending_privileged'].includes(item.status)");
        expect(cancellation).toContain('skip >= page.total');
    });

    it('registers cleanup before setup mutations and runs it in the separate afterEach budget', () => {
        expect(cleanupHook).toMatch(/^test\.afterEach\(async \(\{[^}]*\}, testInfo\) => \{/);
        expect(cleanupHook).toContain('await cleanupWithoutMaskingPrimaryFailure(primaryFailure, cleanup, testInfo)');
        expect(journey.indexOf('vendorOrphanCleanup =')).toBeGreaterThanOrEqual(0);
        expect(journey.indexOf('vendorOrphanCleanup =')).toBeLessThan(journey.indexOf('await ensureVendorArchived'));
        expect(journey.indexOf('cancelVendorOrphanFixtureApprovals')).toBeLessThan(journey.indexOf('restoreVendorOwnerBaseline'));
    });

    it('captures the response identity before any navigation assertion and follows its exact notice link', () => {
        const response = journey.indexOf('approvalId = queuedBody.approval_id ?? null');
        const destination = journey.indexOf('await expect(croPage).toHaveURL');
        expect(response).toBeGreaterThan(0);
        expect(destination).toBeGreaterThan(response);
        expect(journey).toContain('expect(queuedResponse.status()).toBe(202)');
        expect(journey).toContain("toHaveAttribute('href', `/approvals?tab=mine&approvalId=${approvalId}`)");
        expect(journey).toContain('await requestLink.click()');
        expect(journey).toContain('new ApprovalsPage(riskManagerPage)');
    });

    it('reports cancellation rejection when the request remains pending', () => {
        const cancel = source.slice(source.indexOf('async function cancelPendingApproval'), source.indexOf('/** Cancel only'));
        expect(cancel).toContain('`/api/v1/approvals/${approvalId}`');
        expect(cancel).toContain("if (!['pending', 'pending_privileged'].includes(approval.status)) return");
        expect(cancel).toContain('throw new Error(`POST /api/v1/approvals/${approvalId}/cancel failed:');
    });
});
