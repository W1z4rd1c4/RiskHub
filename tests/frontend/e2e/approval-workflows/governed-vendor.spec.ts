/** Issue #87 — protected Vendor pending state and requester cancellation. */
import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../fixtures/auth.fixture';
import { E2E_ICT_VENDOR } from '../fixtures/e2e-data';
import { getVendorByRegistration } from '../helpers/api-auth';
import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from '../helpers/axeBaseline';
import { waitForDataLoad } from '../helpers/wait';

test.describe('Governed protected Vendor workflow (#87)', () => {
    test('queues an immutable edit, exposes its safe pending diff, and cancels it', async ({
        riskManagerPage,
    }) => {
        const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
        expect(vendor).not.toBeNull();
        const reason = `E2E protected Vendor cancellation ${Date.now()}`;
        const proposedNote = `Proposed Vendor note ${Date.now()}`;

        await riskManagerPage.goto(`/vendors/${vendor!.id}/edit`);
        await waitForDataLoad(riskManagerPage);
        await riskManagerPage.getByLabel(/Note|Poznámka/, { exact: true }).fill(proposedNote);
        await riskManagerPage.getByLabel(/Request reason|Důvod žádosti/).fill(reason);
        const queued = riskManagerPage.waitForResponse((response) => (
            response.request().method() === 'PATCH'
            && new URL(response.url()).pathname === `/api/v1/vendors/${vendor!.id}`
        ));
        await riskManagerPage.getByRole('button', { name: /Save|Uložit/ }).click();
        expect((await queued).status()).toBe(202);
        await expect(riskManagerPage).toHaveURL(/\/approvals\?tab=mine&approvalId=\d+/);

        await riskManagerPage.goto(`/vendors/${vendor!.id}`);
        await waitForDataLoad(riskManagerPage);
        const pending = riskManagerPage.getByTestId('vendor-pending-change');
        await expect(pending).toBeVisible();
        await expect(pending.getByText(reason)).toBeVisible();
        await expect(pending.getByTestId('vendor-pending-change-diff')).toContainText(proposedNote);

        const analysis = await new AxeBuilder({ page: riskManagerPage })
            .withTags([...WCAG_TAGS])
            .include('[data-testid="vendor-pending-change"]')
            .analyze();
        assertZeroAxeFindings(toFindings(analysis.violations), 'governed Vendor pending change');

        const cancelled = riskManagerPage.waitForResponse((response) => (
            response.request().method() === 'POST'
            && /\/api\/v1\/approvals\/\d+\/cancel$/.test(new URL(response.url()).pathname)
        ));
        await pending.getByRole('button', { name: /Cancel request|Zrušit žádost/ }).click();
        expect((await cancelled).status()).toBe(200);
        await expect(pending).toHaveCount(0);
        await expect(riskManagerPage.getByText(proposedNote)).toHaveCount(0);
    });
});
