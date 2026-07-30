/** Issue #87 — protected Vendor pending state and requester cancellation. */
import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../fixtures/auth.fixture';
import { E2E_ICT_VENDOR } from '../fixtures/e2e-data';
import { getVendorByRegistration } from '../helpers/api-auth';
import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from '../helpers/axeBaseline';
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
});
