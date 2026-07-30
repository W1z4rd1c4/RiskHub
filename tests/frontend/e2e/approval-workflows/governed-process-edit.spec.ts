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
import { getApiBaseUrl, getDemoToken } from '../helpers/api-auth';
import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from '../helpers/axeBaseline';
import { createProcessViaApi, ensureProcessArchived } from '../helpers/ict-register';
import { waitForDataLoad } from '../helpers/wait';
import { ApprovalsPage } from '../pages/ApprovalsPage';

async function getProcessOwnerId(processId: number): Promise<number> {
    const token = await getDemoToken({
        email: 'risk.manager@riskhub.local',
        fallbackUserIds: [3],
    });
    const response = await fetch(`${getApiBaseUrl()}/api/v1/processes/${processId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`Failed to load Process ${processId}: ${response.status}`);
    }
    const process = await response.json() as { process_owner_user_id: number };
    return process.process_owner_user_id;
}

test.describe('Governed protected Process edit (#84)', () => {
    test('accountability delta requires a reason, queues once in My Requests, and cancellation preserves truth', async ({
        riskManagerPage,
    }) => {
        const processName = `E2E-GOV-PROC-${Date.now()}`;
        const reason = `Transfer Process accountability ${processName}`;
        const created = await createProcessViaApi({
            l0_area: 'Provoz a služby klientům',
            l1_process: processName,
        });

        try {
            const originalProcessOwnerId = await getProcessOwnerId(created.id);

            await riskManagerPage.goto(`/processes/${created.id}`);
            await waitForDataLoad(riskManagerPage);
            await riskManagerPage.getByTestId('process-detail-edit').click();
            await expect(riskManagerPage).toHaveURL(new RegExp(`/processes/${created.id}/edit$`));

            await riskManagerPage.getByTestId('process-form-owner-search').fill(
                'it.analyst@riskhub.local',
            );
            await riskManagerPage.getByTestId('process-form-owner').click();
            await riskManagerPage
                .getByRole('option', { name: /Barbora Němcová.*it\.analyst@riskhub\.local/ })
                .click();
            await riskManagerPage.getByTestId('process-form-submit').click();
            await expect(riskManagerPage.getByTestId('process-form-request-reason'))
                .toHaveAttribute('aria-invalid', 'true');

            await riskManagerPage.getByTestId('process-form-request-reason').fill(reason);
            const submitted = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'PATCH'
                && new URL(response.url()).pathname === `/api/v1/processes/${created.id}`
            ));
            await riskManagerPage.getByTestId('process-form-submit').click();
            expect((await submitted).status()).toBe(202);

            const approvalsPage = new ApprovalsPage(riskManagerPage);
            await approvalsPage.navigate();
            await approvalsPage.selectMyRequests();
            await expect(approvalsPage.approvalCards.filter({ hasText: reason })).toHaveCount(1);
            const requestIndex = await approvalsPage.findCardByReason(reason);
            expect(requestIndex).toBeGreaterThanOrEqual(0);
            await expect(approvalsPage.getCard(requestIndex).getByRole(
                'button',
                { name: /Approve|Schválit/ },
            )).toHaveCount(0);

            expect(await getProcessOwnerId(created.id)).toBe(originalProcessOwnerId);

            await riskManagerPage.goto(`/processes/${created.id}`);
            await waitForDataLoad(riskManagerPage);
            const panel = riskManagerPage.getByTestId('process-pending-change');
            await expect(panel).toBeVisible();
            await expect(panel).toContainText(reason);
            await expect(panel.getByTestId('process-pending-change-diff')).toContainText(
                'Jana Horáková',
            );
            await expect(panel.getByTestId('process-pending-change-diff')).toContainText(
                'Barbora Němcová',
            );
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
            expect(await getProcessOwnerId(created.id)).toBe(originalProcessOwnerId);
        } finally {
            await ensureProcessArchived(processName, true).catch(() => undefined);
        }
    });
});
