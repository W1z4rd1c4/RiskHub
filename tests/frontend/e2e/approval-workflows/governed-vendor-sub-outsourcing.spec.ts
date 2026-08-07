/** Ticket #101 — protected Vendor sub-outsourcing maintenance is governed. */
import { expect, test } from '../fixtures/auth.fixture';
import { E2E_ICT_VENDOR, E2E_SUB_OUTSOURCING, E2E_VENDOR_CONTRACTS } from '../fixtures/e2e-data';
import { getVendorByRegistration } from '../helpers/api-auth';
import {
    type ApprovalScenarioSnapshot,
    cancelPendingApprovalsForMarker,
    cleanupWithoutMaskingPrimaryFailure,
    getApprovalScenario,
    getSubOutsourcingByName,
    runCleanupSteps,
    updateApprovalScenario,
} from '../helpers/ict-register';
import { ApprovalsPage } from '../pages/ApprovalsPage';
import { VendorDetailPage } from '../pages/VendorDetailPage';

test.describe('Governed protected Vendor sub-outsourcing workflow (#101)', () => {
    test('sub-outsourcing create on a protected Vendor queues with a reason and applies only after independent approval', async ({
        riskManagerPage,
        croPage,
    }) => {
        const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
        expect(vendor).not.toBeNull();
        const vendorId = vendor!.id;
        const uniqueName = `E2E-SUB-GOV ${Date.now()}`;
        const reason = `Approve protected Vendor sub-outsourcing ${Date.now()}`;
        let scenario: ApprovalScenarioSnapshot | null = null;
        let primaryFailure: unknown;

        try {
            scenario = await getApprovalScenario('protected_vendor_edit');
            await updateApprovalScenario('protected_vendor_edit', {
                ...scenario,
                requires_approval: true,
            });

            // (1) Submit the protected create with a collected reason.
            const detailPage = new VendorDetailPage(riskManagerPage);
            await detailPage.navigateToSection(vendorId, 'sub-outsourcing');
            // The seeded row's contract label proves the contracts query resolved,
            // so the form's contract dropdown is guaranteed to carry options.
            await expect(
                detailPage
                    .subOutsourcingRowByText(E2E_SUB_OUTSOURCING.DIRECT_PRIMARY.sub_provider_name)
                    .getByText(E2E_VENDOR_CONTRACTS.MAIN_ROI.contract_reference, { exact: true }),
            ).toBeVisible({ timeout: 15000 });

            await riskManagerPage.getByTestId('vendor-sub-outsourcing-add').click();
            await expect(riskManagerPage.getByTestId('vendor-sub-outsourcing-form')).toBeVisible();
            await riskManagerPage.getByTestId('vendor-sub-outsourcing-field-contract_id').click();
            await riskManagerPage
                .getByRole('option', { name: E2E_VENDOR_CONTRACTS.MAIN_ROI.contract_reference, exact: true })
                .click();
            await riskManagerPage.getByTestId('vendor-sub-outsourcing-field-sub_provider_name').fill(uniqueName);

            // Reason-required is enforced before anything leaves the browser.
            await riskManagerPage.getByTestId('vendor-sub-outsourcing-form-save').click();
            await expect(riskManagerPage.getByTestId('vendor-sub-outsourcing-request-reason'))
                .toHaveAttribute('aria-invalid', 'true');
            await riskManagerPage.getByTestId('vendor-sub-outsourcing-request-reason').fill(reason);

            const queued = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'POST'
                && new URL(response.url()).pathname === `/api/v1/vendors/${vendorId}/sub-outsourcing`
            ));
            await riskManagerPage.getByTestId('vendor-sub-outsourcing-form-save').click();

            // (2) The 202 is treated as QUEUED, never as success: the requester
            // lands on the surfaced approval instead of a refreshed chain table.
            expect((await queued).status()).toBe(202);
            await expect(riskManagerPage).toHaveURL(/\/approvals\?tab=mine&approvalId=\d+/);

            // (3) Pre-approval chain truth is UNCHANGED in API and UI.
            expect(await getSubOutsourcingByName(vendorId, uniqueName)).toBeNull();
            await detailPage.navigateToSection(vendorId, 'sub-outsourcing');
            await expect(detailPage.subOutsourcingSection).toBeVisible({ timeout: 15000 });
            await expect(detailPage.subOutsourcingSection.getByText(uniqueName)).toHaveCount(0);

            // (4) An authorized independent approver approves the request.
            const approvals = new ApprovalsPage(croPage);
            await approvals.navigate();
            const approvalIndex = await approvals.findCardByReason(reason);
            await approvals.clickApprove(approvalIndex);
            await approvals.submitResolution(`Approve ${reason}`, 'approve');

            // (5) Post-approval truth changes correctly in API and UI.
            await expect.poll(
                async () => getSubOutsourcingByName(vendorId, uniqueName),
                { timeout: 15000 },
            ).not.toBeNull();
            await detailPage.navigateToSection(vendorId, 'sub-outsourcing');
            await expect(detailPage.subOutsourcingRowByText(uniqueName)).toBeVisible({ timeout: 15000 });
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => runCleanupSteps('Failed to restore governed sub-outsourcing fixture', [
                    () => cancelPendingApprovalsForMarker(reason),
                    ...(scenario === null
                        ? []
                        : [() => updateApprovalScenario('protected_vendor_edit', scenario!)]),
                ]),
                test.info(),
            );
        }
    });
});
