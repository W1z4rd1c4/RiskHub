/** Issue #87 — protected Vendor pending state and requester cancellation. */
import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../fixtures/auth.fixture';
import { E2E_ICT_VENDOR } from '../fixtures/e2e-data';
import {
    ensureVendorArchived,
    getApiBaseUrl,
    getDemoToken,
    getVendorByRegistration,
} from '../helpers/api-auth';
import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from '../helpers/axeBaseline';
import {
    cancelPendingApprovalsForMarker,
    cleanupWithoutMaskingPrimaryFailure,
    getApprovalScenario,
    runCleanupSteps,
    updateApprovalScenario,
} from '../helpers/ict-register';
import { waitForDataLoad } from '../helpers/wait';
import { ApprovalsPage } from '../pages/ApprovalsPage';

test.describe('Governed protected Vendor workflow (#87)', () => {
    test('accountability delta queues once, preserves truth, and rejection keeps the original owner', async ({
        riskManagerPage,
        croPage,
    }) => {
        const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
        expect(vendor).not.toBeNull();
        const originalOwnerId = vendor!.outsourcing_owner_user_id;
        const reason = `Transfer Vendor accountability ${Date.now()}`;

        await riskManagerPage.goto(`/vendors/${vendor!.id}/edit`);
        await waitForDataLoad(riskManagerPage);
        await riskManagerPage.getByTestId('vendor-form-owner-search').fill('ops.analyst@riskhub.local');
        await riskManagerPage.getByTestId('vendor-form-owner').click();
        await riskManagerPage.getByRole('option', { name: /Jana Horáková.*ops\.analyst@riskhub\.local/ }).click();
        await riskManagerPage.getByRole('button', {
            name: /Submit for approval|Odeslat ke schválení/,
        }).click();
        await expect(riskManagerPage.getByLabel(/Request reason|Důvod žádosti/))
            .toHaveAttribute('aria-invalid', 'true');
        await riskManagerPage.getByLabel(/Request reason|Důvod žádosti/).fill(reason);
        const queued = riskManagerPage.waitForResponse((response) => (
            response.request().method() === 'PATCH'
            && new URL(response.url()).pathname === `/api/v1/vendors/${vendor!.id}`
        ));
        await riskManagerPage.getByRole('button', {
            name: /Submit for approval|Odeslat ke schválení/,
        }).click();
        expect((await queued).status()).toBe(202);
        await expect(riskManagerPage).toHaveURL(/\/approvals\?tab=mine&approvalId=\d+/);

        const requesterApprovals = new ApprovalsPage(riskManagerPage);
        await requesterApprovals.navigate();
        await requesterApprovals.selectMyRequests();
        await expect(requesterApprovals.approvalCards.filter({ hasText: reason })).toHaveCount(1);
        const requestIndex = await requesterApprovals.findCardByReason(reason);
        await expect(requesterApprovals.getCard(requestIndex).getByRole(
            'button',
            { name: /Approve|Schválit/ },
        )).toHaveCount(0);
        expect((await getVendorByRegistration(E2E_ICT_VENDOR.registration_id))!
            .outsourcing_owner_user_id).toBe(originalOwnerId);

        await riskManagerPage.goto(`/vendors/${vendor!.id}`);
        await waitForDataLoad(riskManagerPage);
        const pending = riskManagerPage.getByTestId('vendor-pending-change');
        await expect(pending).toBeVisible();
        await expect(pending.getByText(reason)).toBeVisible();
        await expect(pending.getByTestId('vendor-pending-change-diff')).toContainText('Jana Horáková');

        const analysis = await new AxeBuilder({ page: riskManagerPage })
            .withTags([...WCAG_TAGS])
            .include('[data-testid="vendor-pending-change"]')
            .analyze();
        assertZeroAxeFindings(toFindings(analysis.violations), 'governed Vendor pending change');

        const resolverApprovals = new ApprovalsPage(croPage);
        await resolverApprovals.navigate();
        const resolverIndex = await resolverApprovals.findCardByReason(reason);
        await resolverApprovals.clickReject(resolverIndex);
        const rejected = croPage.waitForResponse((response) => (
            response.request().method() === 'POST'
            && /\/api\/v1\/approvals\/\d+\/reject$/.test(new URL(response.url()).pathname)
        ));
        await resolverApprovals.submitResolution(`Reject ${reason}`, 'reject');
        expect((await rejected).status()).toBe(200);
        expect((await getVendorByRegistration(E2E_ICT_VENDOR.registration_id))!
            .outsourcing_owner_user_id).toBe(originalOwnerId);
        await riskManagerPage.reload();
        await expect(riskManagerPage.getByTestId('vendor-pending-change')).toHaveCount(0);
    });

    test('direct accountability edit preserves approved truth until an independent CRO approves it', async ({
        riskManagerPage,
        croPage,
    }) => {
        const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
        expect(vendor).not.toBeNull();
        expect(typeof vendor!.outsourcing_owner_user_id).toBe('number');
        const originalOwnerId = vendor!.outsourcing_owner_user_id!;
        const originalArchived = vendor!.is_archived === true;
        const originalVendorScenario = await getApprovalScenario('protected_vendor_edit');
        const originalAccountabilityScenario = await getApprovalScenario('accountability_reassignment');
        const reason = `Approve direct Vendor accountability ${Date.now()}`;
        let approvalId: number | null = null;
        let primaryFailure: unknown;

        try {
            await ensureVendorArchived(E2E_ICT_VENDOR.registration_id, false);
            await riskManagerPage.goto(`/vendors/${vendor!.id}/edit`);
            await waitForDataLoad(riskManagerPage);
            await riskManagerPage.getByTestId('vendor-form-owner-search').fill('ops.analyst@riskhub.local');
            await riskManagerPage.getByTestId('vendor-form-owner').click();
            await riskManagerPage.getByRole('option', {
                name: /Jana Horáková.*ops\.analyst@riskhub\.local/,
            }).click();
            await riskManagerPage.getByRole('button', {
                name: /Submit for approval|Odeslat ke schválení/,
            }).click();
            await riskManagerPage.getByLabel(/Request reason|Důvod žádosti/).fill(reason);
            const queued = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'PATCH'
                && new URL(response.url()).pathname === `/api/v1/vendors/${vendor!.id}`
            ));
            await riskManagerPage.getByRole('button', {
                name: /Submit for approval|Odeslat ke schválení/,
            }).click();
            const queuedResponse = await queued;
            expect(queuedResponse.status()).toBe(202);
            approvalId = (await queuedResponse.json() as { approval_id: number | null }).approval_id;
            expect((await getVendorByRegistration(E2E_ICT_VENDOR.registration_id))!
                .outsourcing_owner_user_id).toBe(originalOwnerId);

            const resolverApprovals = new ApprovalsPage(croPage);
            await resolverApprovals.navigate();
            const resolverIndex = await resolverApprovals.findCardByReason(reason);
            await resolverApprovals.clickApprove(resolverIndex);
            await resolverApprovals.submitResolution(`Approve ${reason}`, 'approve');
            await expect.poll(
                async () => (await getVendorByRegistration(E2E_ICT_VENDOR.registration_id))!
                    .outsourcing_owner_user_id,
            ).toBe(7);
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => runCleanupSteps('Failed to restore protected Vendor direct-edit fixture', [
                    ...(approvalId === null ? [] : [async () => {
                        const token = await getDemoToken({
                            email: 'risk.manager@riskhub.local',
                            fallbackUserIds: [3],
                        });
                        const response = await fetch(`${getApiBaseUrl()}/api/v1/approvals/${approvalId}/cancel`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}` },
                        });
                        if (!response.ok && ![400, 404, 409].includes(response.status)) {
                            throw new Error(`Failed to cancel Vendor approval ${approvalId}: ${response.status}`);
                        }
                    }]),
                    () => updateApprovalScenario('protected_vendor_edit', {
                        ...originalVendorScenario,
                        requires_approval: false,
                    }),
                    () => updateApprovalScenario('accountability_reassignment', {
                        ...originalAccountabilityScenario,
                        requires_approval: false,
                    }),
                    () => ensureVendorArchived(E2E_ICT_VENDOR.registration_id, false).then(async () => {
                        const token = await getDemoToken({
                            email: 'risk.manager@riskhub.local',
                            fallbackUserIds: [3],
                        });
                        const response = await fetch(`${getApiBaseUrl()}/api/v1/vendors/${vendor!.id}`, {
                            method: 'PATCH',
                            headers: {
                                Authorization: `Bearer ${token}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ outsourcing_owner_user_id: originalOwnerId }),
                        });
                        if (!response.ok) {
                            throw new Error(`Failed to restore Vendor owner: ${response.status} ${await response.text()}`);
                        }
                    }),
                    () => ensureVendorArchived(E2E_ICT_VENDOR.registration_id, originalArchived).then(() => undefined),
                    () => updateApprovalScenario('protected_vendor_edit', originalVendorScenario),
                    () => updateApprovalScenario('accountability_reassignment', originalAccountabilityScenario),
                ]),
                test.info(),
            );
        }
    });

    test('archive preserves approved truth until independent approval and restore stays direct', async ({
        riskManagerPage,
        croPage,
    }) => {
        const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
        expect(vendor).not.toBeNull();
        const vendorId = vendor!.id;
        const originalArchived = vendor!.is_archived === true;
        const reason = `Archive protected Vendor ${Date.now()}`;
        let primaryFailure: unknown;

        try {
            await ensureVendorArchived(E2E_ICT_VENDOR.registration_id, false);
            await riskManagerPage.goto(`/vendors/${vendorId}`);
            await waitForDataLoad(riskManagerPage);
            await riskManagerPage.locator('button[title="Archive"], button[title="Archivovat"]').click();
            const dialog = riskManagerPage.getByRole('alertdialog');
            await dialog.getByRole('textbox', { name: /Request reason|Důvod žádosti/ }).fill(reason);
            const queued = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'DELETE'
                && new URL(response.url()).pathname === `/api/v1/vendors/${vendorId}`
            ));
            await dialog.getByRole('button', { name: /Archive|Archivovat/ }).click();
            expect((await queued).status()).toBe(202);

            const requesterApprovals = new ApprovalsPage(riskManagerPage);
            await requesterApprovals.navigate();
            await requesterApprovals.selectMyRequests();
            const requesterIndex = await requesterApprovals.findCardByReason(reason);
            await expect(requesterApprovals.getCard(requesterIndex).getByRole(
                'button',
                { name: /Approve|Schválit/ },
            )).toHaveCount(0);
            const preApprovalVendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
            expect(preApprovalVendor).not.toBeNull();
            expect(preApprovalVendor!.is_archived).toBe(false);

            await riskManagerPage.goto(`/vendors/${vendorId}`);
            await waitForDataLoad(riskManagerPage);
            await expect(riskManagerPage.locator(
                'button[title="Unarchive"], button[title="Obnovit z archivu"]',
            ))
                .toHaveCount(0);

            const resolverApprovals = new ApprovalsPage(croPage);
            await resolverApprovals.navigate();
            const resolverIndex = await resolverApprovals.findCardByReason(reason);
            await resolverApprovals.clickApprove(resolverIndex);
            await resolverApprovals.submitResolution(`Approve ${reason}`, 'approve');
            await expect.poll(
                async () => (await getVendorByRegistration(E2E_ICT_VENDOR.registration_id))?.is_archived,
            ).toBe(true);

            await riskManagerPage.goto(`/vendors/${vendorId}`);
            await waitForDataLoad(riskManagerPage);
            const restored = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'POST'
                && new URL(response.url()).pathname === `/api/v1/vendors/${vendorId}/restore`
            ));
            await riskManagerPage.locator(
                'button[title="Unarchive"], button[title="Obnovit z archivu"]',
            ).click();
            expect((await restored).status()).toBe(200);
            await expect(riskManagerPage.locator(
                'button[title="Archive"], button[title="Archivovat"]',
            )).toBeVisible();
            const restoredVendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
            expect(restoredVendor).not.toBeNull();
            expect(restoredVendor!.is_archived).toBe(false);
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => runCleanupSteps('Failed to restore protected Vendor archive fixture', [
                    () => cancelPendingApprovalsForMarker(reason),
                    () => ensureVendorArchived(E2E_ICT_VENDOR.registration_id, originalArchived).then(() => undefined),
                ]),
                test.info(),
            );
        }
    });
});
