/** Issue #86 — protected Asset lifecycle and Asset-only composite proposals. */
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page, Response } from '@playwright/test';

import { expect, test } from '../fixtures/auth.fixture';
import { E2E_ASSETS } from '../fixtures/e2e-data';
import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from '../helpers/axeBaseline';
import {
    createProcessViaApi,
    getAssetByName,
} from '../helpers/ict-register';
import { waitForDataLoad } from '../helpers/wait';

const APPROVAL_CARD = '.space-y-4 .glass-card';

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
    await dialog.getByRole('textbox').fill(`Independent Asset approval: ${reason}`);
    const resolved = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && /\/api\/v1\/approvals\/\d+\/approve$/.test(new URL(response.url()).pathname)
    ));
    await dialog.getByRole('button', { name: /Approve|Schválit/ }).click();
    expect((await resolved).status()).toBe(200);
}

async function submitGovernedDialog(
    page: Page,
    reason: string,
    trigger: () => Promise<void>,
    responseMatches: (response: Response) => boolean,
): Promise<void> {
    await trigger();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('textbox', { name: /Request reason|Důvod žádosti/ }).fill(reason);
    const submitted = page.waitForResponse(responseMatches);
    await dialog.getByRole('button', { name: /Continue|Pokračovat|Archive|Archivovat/ }).click();
    expect((await submitted).status()).toBe(202);
}

test.describe('Governed protected Asset workflow (#86)', () => {
    test.describe.configure({ mode: 'serial' });

    test('rowless creation, immutable edit, and archive activate only after approval', async ({
        riskManagerPage,
        croPage,
    }) => {
        test.setTimeout(240_000);
        const assetName = `E2E-GOV-ASSET-${Date.now()}`;
        const createReason = `Create protected Asset ${assetName}`;

        await riskManagerPage.goto('/assets/new');
        await waitForDataLoad(riskManagerPage);
        await riskManagerPage.getByTestId('asset-form-name').fill(assetName);
        await riskManagerPage.getByTestId('asset-form-business-owner').click();
        await riskManagerPage.getByRole('option').filter({ hasText: 'ops.head@riskhub.local' }).first().click();
        await riskManagerPage.getByTestId('asset-form-ict-owner').click();
        await riskManagerPage.getByRole('option').filter({ hasText: 'it.head@riskhub.local' }).first().click();
        await riskManagerPage.getByTestId('asset-form-owner-department').click();
        await riskManagerPage.getByRole('option').filter({ hasText: 'Operations' }).first().click();
        await riskManagerPage.getByTestId('asset-form-preliminary-criticality').click();
        await riskManagerPage.getByRole('option', { name: /Critical|Kritická/, exact: true }).click();
        await riskManagerPage.getByTestId('asset-form-request-reason').fill(createReason);
        const createdProposal = riskManagerPage.waitForResponse((response) => (
            response.request().method() === 'POST'
            && new URL(response.url()).pathname === '/api/v1/assets'
        ));
        await riskManagerPage.getByTestId('asset-form-submit').click();
        expect((await createdProposal).status()).toBe(202);
        expect(await getAssetByName(assetName)).toBeNull();

        const ownCard = await requestCard(riskManagerPage, createReason);
        await expect(ownCard.getByRole('button', { name: /Approve|Schválit/ })).toHaveCount(0);
        await approveRequest(croPage, createReason);
        await expect.poll(async () => (await getAssetByName(assetName))?.id ?? null).not.toBeNull();
        const asset = await getAssetByName(assetName);
        expect(asset).not.toBeNull();

        const editReason = `Edit protected Asset ${assetName}`;
        await riskManagerPage.goto(`/assets/${asset!.id}/edit`);
        await waitForDataLoad(riskManagerPage);
        await riskManagerPage.getByTestId('asset-form-notes').fill('Proposed protected Asset notes');
        await riskManagerPage.getByTestId('asset-form-request-reason').fill(editReason);
        const editedProposal = riskManagerPage.waitForResponse((response) => (
            response.request().method() === 'PATCH'
            && new URL(response.url()).pathname === `/api/v1/assets/${asset!.id}`
        ));
        await riskManagerPage.getByTestId('asset-form-submit').click();
        expect((await editedProposal).status()).toBe(202);
        await riskManagerPage.goto(`/assets/${asset!.id}`);
        const pending = riskManagerPage.getByTestId('asset-pending-change');
        await expect(pending).toBeVisible();
        await expect(pending.getByTestId('asset-pending-change-diff')).toContainText('Proposed protected Asset notes');
        const analysis = await new AxeBuilder({ page: riskManagerPage })
            .withTags([...WCAG_TAGS])
            .include('[data-testid="asset-pending-change"]')
            .analyze();
        assertZeroAxeFindings(toFindings(analysis.violations), 'governed Asset pending change');
        await approveRequest(croPage, editReason);

        const archiveReason = `Archive protected Asset ${assetName}`;
        await riskManagerPage.goto(`/assets/${asset!.id}`);
        await waitForDataLoad(riskManagerPage);
        await submitGovernedDialog(
            riskManagerPage,
            archiveReason,
            () => riskManagerPage.getByTestId('asset-detail-archive').click(),
            (response) => response.request().method() === 'DELETE'
                && new URL(response.url()).pathname === `/api/v1/assets/${asset!.id}`,
        );
        expect((await getAssetByName(assetName))?.is_archived).not.toBe(true);
        await approveRequest(croPage, archiveReason);
        await expect.poll(async () => (await getAssetByName(assetName))?.is_archived).toBe(true);
    });

    test('Asset-only protected Process link exposes composite Asset impact before apply', async ({
        riskManagerPage,
        croPage,
    }) => {
        const stamp = Date.now();
        const asset = await getAssetByName(E2E_ASSETS.CLAIMS_DATABASE.name);
        expect(asset).not.toBeNull();
        const process = await createProcessViaApi({
            l0_area: 'Operations',
            l1_process: `E2E-NON-CIF-${stamp}`,
            cif_override: 'no',
        });
        const reason = `Asset-only composite ${stamp}`;
        await riskManagerPage.goto(`/assets/${asset!.id}`);
        await waitForDataLoad(riskManagerPage);
        await riskManagerPage.getByTestId('asset-process-link-select').click();
        await riskManagerPage.getByRole('option', { name: new RegExp(process.l1_process) }).click();
        await submitGovernedDialog(
            riskManagerPage,
            reason,
            () => riskManagerPage.getByTestId('asset-process-link-add').click(),
            (response) => response.request().method() === 'POST'
                && new URL(response.url()).pathname === `/api/v1/assets/${asset!.id}/process-links`,
        );
        const card = await requestCard(riskManagerPage, reason);
        await expect(card.getByTestId(/approval-governed-mutation-/)).toContainText(asset!.name);
        await riskManagerPage.goto(`/assets/${asset!.id}`);
        await expect(riskManagerPage.getByTestId('asset-process-links').getByText(process.l1_process)).toHaveCount(0);
        await approveRequest(croPage, reason);
        await riskManagerPage.goto(`/assets/${asset!.id}`);
        await expect(riskManagerPage.getByTestId('asset-process-links').getByText(process.l1_process)).toBeVisible();
    });
});
