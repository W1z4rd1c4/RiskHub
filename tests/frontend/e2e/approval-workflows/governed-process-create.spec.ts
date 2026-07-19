/** Issue #85 — protected Process creation stays non-operational until approval. */
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixtures/auth.fixture';
import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from '../helpers/axeBaseline';
import { getApiBaseUrl, getDemoToken } from '../helpers/api-auth';
import {
    cleanupGovernedProcessFixture,
    cleanupWithoutMaskingPrimaryFailure,
    getProcessByL1,
} from '../helpers/ict-register';
import { waitForDataLoad } from '../helpers/wait';

const APPROVAL_CARD = '.space-y-4 .glass-card';

async function submitProtectedCreation(page: Page, processName: string, reason: string): Promise<void> {
    await page.goto('/processes/new');
    await waitForDataLoad(page);
    await page.getByTestId('process-form-l0-area').fill('Critical operations');
    await page.getByTestId('process-form-l1-process').fill(processName);
    await page.getByTestId('process-form-owner').click();
    await page.getByRole('option').filter({ hasText: 'ops.analyst@riskhub.local' }).first().click();
    await page.getByTestId('process-form-cif-override').click();
    await page.getByRole('option', { name: /Yes|Ano/, exact: true }).click();
    await page.getByTestId('process-form-request-reason').fill(reason);

    const submitted = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/v1/processes'
    ));
    await page.getByTestId('process-form-submit').click();
    expect((await submitted).status()).toBe(202);
    await expect(page).toHaveURL(/\/approvals\?tab=mine&approvalId=\d+/);
}

async function requestCard(page: Page, reason: string): Promise<Locator> {
    const card = page.locator(APPROVAL_CARD).filter({ hasText: reason }).first();
    await expect(card).toBeVisible();
    return card;
}

async function approveRequest(page: Page, reason: string): Promise<void> {
    await page.goto('/approvals');
    await waitForDataLoad(page);
    const card = await requestCard(page, reason);
    await card.getByRole('button', { name: /Approve|Schválit/ }).click();
    const dialog = page.locator('.fixed.inset-0.z-50 .glass').last();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').fill(`Independent approval: ${reason}`);
    const resolved = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && /\/api\/v1\/approvals\/\d+\/approve$/.test(new URL(response.url()).pathname)
    ));
    await dialog.getByRole('button', { name: /Approve|Schválit/ }).click();
    expect((await resolved).status()).toBe(200);
}

async function expectOperationalSearchEmpty(processName: string): Promise<void> {
    const apiBase = getApiBaseUrl();
    const token = await getDemoToken({
        email: 'ops.analyst@riskhub.local',
        fallbackUserIds: [7],
    });
    const params = new URLSearchParams({ search: processName, limit: '100' });
    const response = await fetch(`${apiBase}/api/v1/processes?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok).toBe(true);
    const body = await response.json() as { items: Array<{ l1_process: string }> };
    expect(body.items.some((item) => item.l1_process === processName)).toBe(false);
}

async function expectOperationalExportEmpty(processName: string): Promise<void> {
    const apiBase = getApiBaseUrl();
    const token = await getDemoToken({
        email: 'risk.manager@riskhub.local',
        fallbackUserIds: [3],
    });
    const params = new URLSearchParams({ format: 'csv', locale: 'en', search: processName });
    const response = await fetch(`${apiBase}/api/v1/processes/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok).toBe(true);
    expect(await response.text()).not.toContain(processName);
}

test.describe('Governed protected Process creation (#85)', () => {
    test.describe.configure({ mode: 'serial' });

    test('requester sees a separate cancellable pending creation and no operational row', async ({
        riskManagerPage,
        employeePage,
    }) => {
        const processName = `E2E-GOV-CREATE-${Date.now()}`;
        const reason = `New critical function ${processName}`;
        let primaryFailure: unknown;
        try {
            await submitProtectedCreation(riskManagerPage, processName, reason);

            // The requester may cancel but cannot resolve their own governed proposal.
            const ownCard = await requestCard(riskManagerPage, reason);
            await expect(ownCard.getByRole('button', { name: /Approve|Schválit/ })).toHaveCount(0);
            await expect(ownCard.getByRole('button', { name: /Reject|Zamítnout/ })).toHaveCount(0);
            await expect(ownCard.getByRole('button', { name: /Cancel Request|Zrušit žádost/ })).toBeVisible();

            await riskManagerPage.goto('/processes');
            await waitForDataLoad(riskManagerPage);
            const pendingPanel = riskManagerPage.getByTestId('process-pending-creations');
            await expect(pendingPanel).toContainText(processName);
            await expect(riskManagerPage.locator('table').first()).not.toContainText(processName);

            // A different operational user sees neither the proposal nor an operational row.
            await employeePage.goto(`/processes?search=${encodeURIComponent(processName)}`);
            await waitForDataLoad(employeePage);
            await expect(employeePage.getByTestId('process-pending-creations')).toHaveCount(0);
            await expect(employeePage.getByText(processName, { exact: true })).toHaveCount(0);
            await expectOperationalSearchEmpty(processName);
            await expectOperationalExportEmpty(processName);

            const analysis = await new AxeBuilder({ page: riskManagerPage })
                .withTags([...WCAG_TAGS])
                .include('[data-testid="process-pending-creations"]')
                .analyze();
            assertZeroAxeFindings(toFindings(analysis.violations), 'governed Process pending creation');

            const cancelled = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'POST'
                && /\/api\/v1\/approvals\/\d+\/cancel$/.test(new URL(response.url()).pathname)
            ));
            await pendingPanel.getByRole('button', { name: /Cancel request|Zrušit žádost/ }).click();
            expect((await cancelled).status()).toBe(200);
            await expect(pendingPanel).toHaveCount(0);
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => cleanupGovernedProcessFixture({ processName }),
                test.info(),
            );
        }
    });

    test('eligible CRO approval activates creation, protected archive preserves truth, and restore stays direct', async ({
        riskManagerPage,
        croPage,
    }) => {
        const processName = `E2E-GOV-LIFECYCLE-${Date.now()}`;
        const createReason = `Approve protected creation ${processName}`;
        let primaryFailure: unknown;
        try {
            await submitProtectedCreation(riskManagerPage, processName, createReason);
            expect(await getProcessByL1(processName)).toBeNull();

            await approveRequest(croPage, createReason);
            await expect.poll(async () => (await getProcessByL1(processName))?.id ?? null).not.toBeNull();
            const created = await getProcessByL1(processName);
            expect(created).not.toBeNull();

            await riskManagerPage.goto(`/processes/${created!.id}`);
            await waitForDataLoad(riskManagerPage);
            await expect(riskManagerPage.getByRole('heading', { name: processName })).toBeVisible();

            const archiveReason = `Archive protected Process ${processName}`;
            await riskManagerPage.getByTestId('process-detail-archive').click();
            const archiveDialog = riskManagerPage.getByRole('alertdialog');
            await expect(archiveDialog.getByRole('textbox', { name: /Request reason|Důvod žádosti/ })).toBeVisible();
            await archiveDialog.getByRole('textbox', { name: /Request reason|Důvod žádosti/ }).fill(archiveReason);
            const submitted = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'DELETE'
                && new URL(response.url()).pathname === `/api/v1/processes/${created!.id}`
            ));
            await archiveDialog.getByRole('button', { name: /Archive|Archivovat/ }).click();
            expect((await submitted).status()).toBe(202);

            // The approved Process remains active while archive approval is pending.
            await riskManagerPage.goto(`/processes/${created!.id}`);
            await waitForDataLoad(riskManagerPage);
            await expect(riskManagerPage.getByTestId('process-detail-restore')).toHaveCount(0);
            expect((await getProcessByL1(processName))?.is_archived).not.toBe(true);

            await approveRequest(croPage, archiveReason);
            await riskManagerPage.goto(`/processes/${created!.id}`);
            await waitForDataLoad(riskManagerPage);
            await expect(riskManagerPage.getByTestId('process-detail-restore')).toBeVisible();

            const restored = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'POST'
                && new URL(response.url()).pathname === `/api/v1/processes/${created!.id}/restore`
            ));
            await riskManagerPage.getByTestId('process-detail-restore').click();
            expect((await restored).status()).toBe(200);
            await expect(riskManagerPage.getByTestId('process-detail-archive')).toBeVisible();
            await expect(riskManagerPage.getByTestId('process-detail-restore')).toHaveCount(0);
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => cleanupGovernedProcessFixture({ processName }),
                test.info(),
            );
        }
    });
});
