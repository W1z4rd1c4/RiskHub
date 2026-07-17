/**
 * Issue #84 — protected Process edit tracer.
 *
 * Exercises the real UI and API boundary: an approved CIF Process keeps its
 * current truth while a reasoned proposal is pending, exposes a scoped diff,
 * blocks another business edit, remains cancellable by its requester, and
 * never applies the cancelled values.
 */
import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../fixtures/auth.fixture';
import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from '../helpers/axeBaseline';
import { createProcessViaApi, ensureProcessArchived } from '../helpers/ict-register';
import { waitForDataLoad } from '../helpers/wait';

test.describe('Governed protected Process edit (#84)', () => {
    test('requester sees immutable pending truth, accessible diff, lock, and cancellation', async ({
        riskManagerPage,
    }) => {
        const processName = `E2E-GOV-PROC-${Date.now()}`;
        const originalNotes = 'Approved baseline notes';
        const proposedNotes = 'Proposed governed notes';
        const created = await createProcessViaApi({
            l0_area: 'Provoz a služby klientům',
            l1_process: processName,
            cif_override: 'yes',
            notes: originalNotes,
        });

        try {
            await riskManagerPage.goto(`/processes/${created.id}`);
            await waitForDataLoad(riskManagerPage);
            await riskManagerPage.getByTestId('process-detail-edit').click();
            await expect(riskManagerPage).toHaveURL(new RegExp(`/processes/${created.id}/edit$`));

            await riskManagerPage.getByTestId('process-form-notes').fill(proposedNotes);
            await riskManagerPage.getByTestId('process-form-request-reason').fill(
                'Material protected Process change',
            );
            const submitted = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'PATCH'
                && new URL(response.url()).pathname === `/api/v1/processes/${created.id}`
            ));
            await riskManagerPage.getByTestId('process-form-submit').click();
            expect((await submitted).status()).toBe(202);

            await expect(riskManagerPage).toHaveURL(new RegExp(`/processes/${created.id}$`));
            const panel = riskManagerPage.getByTestId('process-pending-change');
            await expect(panel).toBeVisible();
            await expect(panel).toContainText('Material protected Process change');
            await expect(panel.getByTestId('process-pending-change-diff')).toContainText('Notes');
            await expect(panel.getByTestId('process-pending-change-diff')).toContainText(originalNotes);
            await expect(panel.getByTestId('process-pending-change-diff')).toContainText(proposedNotes);
            await expect(riskManagerPage.getByTestId('process-detail-edit')).toHaveCount(0);

            const analysis = await new AxeBuilder({ page: riskManagerPage })
                .withTags([...WCAG_TAGS])
                .include('[data-testid="process-pending-change"]')
                .analyze();
            assertZeroAxeFindings(
                toFindings(analysis.violations),
                'governed Process pending-change panel',
            );

            const cancelled = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'POST'
                && /\/api\/v1\/approvals\/\d+\/cancel$/.test(new URL(response.url()).pathname)
            ));
            await panel.getByRole('button', { name: /Cancel request|Zrušit žádost/ }).click();
            expect((await cancelled).status()).toBe(200);

            await expect(panel).toHaveCount(0);
            await expect(riskManagerPage.getByTestId('process-detail-edit')).toBeVisible();
            const detailResponse = await riskManagerPage.request.get(
                `/api/v1/processes/${created.id}`,
            );
            expect(detailResponse.ok()).toBe(true);
            expect((await detailResponse.json()).notes).toBe(originalNotes);
        } finally {
            await ensureProcessArchived(processName, true).catch(() => undefined);
        }
    });
});
