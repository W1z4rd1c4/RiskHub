/** Issue #85 — every Process relationship end uses the same governed tracer. */
import type { BrowserContext, Locator, Page, Response } from '@playwright/test';

import { DEMO_ACCOUNTS, expect, test } from '../fixtures/auth.fixture';
import {
    E2E_ASSETS,
    E2E_ICT_REGISTER_RISK,
    E2E_VENDORS,
} from '../fixtures/e2e-data';
import { getRiskByCode, getVendorByRegistration } from '../helpers/api-auth';
import {
    cleanupGovernedProcessFixture,
    cleanupWithoutMaskingPrimaryFailure,
    getAssetByName,
    getProcessByL1,
    listAssetProcessLinks,
} from '../helpers/ict-register';
import { loginAsDemoUser } from '../helpers/login';
import { waitForDataLoad } from '../helpers/wait';

const APPROVAL_CARD = '.space-y-4 .glass-card';

async function selectExactOption(page: Page, triggerTestId: string, label: string): Promise<void> {
    await page.getByTestId(triggerTestId).click();
    await page.getByRole('option', { name: label, exact: true }).click();
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
    const dialog = page.getByRole('dialog', { name: /Approve Request|Schválit žádost/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', {
        name: /Please provide a reason for this decision|Uveďte prosím důvod tohoto rozhodnutí/,
    }).fill(`Independent approval: ${reason}`);
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
    const reasonInput = dialog.getByRole('textbox', { name: /Request reason|Důvod žádosti/ });
    await expect(reasonInput).toBeVisible();
    await reasonInput.fill(reason);
    const submitted = page.waitForResponse(responseMatches);
    await dialog.getByRole('button', { name: /Continue|Pokračovat/ }).click();
    expect((await submitted).status()).toBe(202);
    await expect(page).toHaveURL(/\/approvals\?tab=mine&approvalId=\d+/);

    // The requester can inspect/cancel but cannot self-approve or self-reject.
    const ownCard = await requestCard(page, reason);
    await expect(ownCard.getByRole('button', { name: /Approve|Schválit/ })).toHaveCount(0);
    await expect(ownCard.getByRole('button', { name: /Reject|Zamítnout/ })).toHaveCount(0);
    await expect(ownCard.getByRole('button', { name: /Cancel Request|Zrušit žádost/ })).toBeVisible();
}

async function createApprovedProtectedProcess(
    requester: Page,
    approver: Page,
    processName: string,
): Promise<number> {
    const reason = `Relationship tracer fixture ${processName}`;
    await requester.goto('/processes/new');
    await waitForDataLoad(requester);
    await requester.getByTestId('process-form-l0-area').fill('Critical relationship operations');
    await requester.getByTestId('process-form-l1-process').fill(processName);
    await requester.getByTestId('process-form-owner').click();
    await requester.getByRole('option').filter({ hasText: 'ops.analyst@riskhub.local' }).first().click();
    await requester.getByTestId('process-form-cif-override').click();
    await requester.getByRole('option', { name: /Yes|Ano/, exact: true }).click();
    await requester.getByTestId('process-form-request-reason').fill(reason);
    const submitted = requester.waitForResponse((response) => (
        response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/v1/processes'
    ));
    await requester.getByTestId('process-form-submit').click();
    expect((await submitted).status()).toBe(202);
    await approveRequest(approver, reason);
    await expect.poll(async () => (await getProcessByL1(processName))?.id ?? null).not.toBeNull();
    return (await getProcessByL1(processName))!.id;
}

test.describe('Governed protected Process relationships (#85)', () => {
    test('Risk, Asset, and Vendor ends preserve approved truth until independent approval', async ({
        riskManagerPage,
        croPage,
        browser,
    }) => {
        test.setTimeout(300_000);
        const processName = `E2E-GOV-REL-${Date.now()}`;
        let primaryFailure: unknown;
        let relationshipContext: BrowserContext | undefined;
        let relationshipPage: Page | undefined;
        let assetPrimaryBaseline: { assetId: number; processId: number | null } | undefined;
        try {
            const processId = await createApprovedProtectedProcess(riskManagerPage, croPage, processName);

            const risk = await getRiskByCode(E2E_ICT_REGISTER_RISK.code);
            const asset = await getAssetByName(E2E_ASSETS.REPORTING_WAREHOUSE.name);
            const vendor = await getVendorByRegistration(E2E_VENDORS.ACTIVE_PRIMARY.registration_id);
            expect(risk).not.toBeNull();
            expect(asset).not.toBeNull();
            expect(vendor).not.toBeNull();
            const primaryLink = (await listAssetProcessLinks(asset!.id)).find((link) => link.is_primary);
            assetPrimaryBaseline = {
                assetId: asset!.id,
                processId: primaryLink?.process_id ?? null,
            };

            // Risk -> Process add preserves the absent approved baseline until approval.
            await riskManagerPage.goto(`/risks/${risk!.id}`);
            await waitForDataLoad(riskManagerPage);
            await selectExactOption(riskManagerPage, 'risk-process-link-select', processName);
            const riskAddReason = `Approve protected Risk link add ${processName}`;
            await submitGovernedDialog(
                riskManagerPage,
                riskAddReason,
                () => riskManagerPage.getByTestId('risk-process-link-add').click(),
                (response) => response.request().method() === 'POST'
                    && new URL(response.url()).pathname === `/api/v1/risks/${risk!.id}/process-links`,
            );
            await riskManagerPage.goto(`/risks/${risk!.id}`);
            await waitForDataLoad(riskManagerPage);
            await expect(riskManagerPage.getByTestId('risk-process-link-rows').getByText(processName)).toHaveCount(0);
            await approveRequest(croPage, riskAddReason);
            await riskManagerPage.reload();
            await waitForDataLoad(riskManagerPage);
            const riskRow = riskManagerPage.getByTestId('risk-process-link-rows').getByRole('listitem').filter({ hasText: processName });
            await expect(riskRow).toBeVisible();

            // Removal preserves the approved link until approval, then removes it.
            const riskRemoveReason = `Approve protected Risk link remove ${processName}`;
            await submitGovernedDialog(
                riskManagerPage,
                riskRemoveReason,
                () => riskRow.locator('[data-testid^="risk-process-link-remove-"]').click(),
                (response) => response.request().method() === 'DELETE'
                    && /\/api\/v1\/risks\/\d+\/process-links\/\d+$/.test(new URL(response.url()).pathname),
            );
            await riskManagerPage.goto(`/risks/${risk!.id}`);
            await waitForDataLoad(riskManagerPage);
            await expect(riskManagerPage.getByTestId('risk-process-link-rows').getByText(processName)).toBeVisible();
            await approveRequest(croPage, riskRemoveReason);
            relationshipContext = await browser.newContext();
            relationshipPage = await relationshipContext.newPage();
            await loginAsDemoUser(relationshipPage, DEMO_ACCOUNTS.RISK_MANAGER);
            await relationshipPage.goto(`/risks/${risk!.id}`);
            await waitForDataLoad(relationshipPage);
            await expect(relationshipPage.getByTestId('risk-process-link-rows')).toBeVisible();
            await expect(relationshipPage.getByTestId('risk-process-link-rows').getByText(processName)).toHaveCount(0);

            // Asset -> Process add/update/remove all share the tracer. Setting the
            // primary flag is the relationship update applicable to this end.
            await relationshipPage.goto(`/assets/${asset!.id}`);
            await waitForDataLoad(relationshipPage);
            await selectExactOption(relationshipPage, 'asset-process-link-select', processName);
            const assetAddReason = `Approve protected Asset link add ${processName}`;
            await submitGovernedDialog(
                relationshipPage,
                assetAddReason,
                () => relationshipPage.getByTestId('asset-process-link-add').click(),
                (response) => response.request().method() === 'POST'
                    && new URL(response.url()).pathname === `/api/v1/assets/${asset!.id}/process-links`,
            );
            await relationshipPage.goto(`/assets/${asset!.id}`);
            await waitForDataLoad(relationshipPage);
            await expect(relationshipPage.getByTestId('asset-process-links').getByText(processName)).toHaveCount(0);
            await approveRequest(croPage, assetAddReason);
            await relationshipPage.reload();
            await waitForDataLoad(relationshipPage);
            await expect(relationshipPage.getByTestId('asset-process-links').getByText(processName)).toBeVisible();

            const assetUpdateReason = `Approve protected Asset link update ${processName}`;
            await submitGovernedDialog(
                relationshipPage,
                assetUpdateReason,
                () => relationshipPage.getByTestId(`asset-process-link-set-primary-${processId}`).click(),
                (response) => response.request().method() === 'PATCH'
                    && new URL(response.url()).pathname === `/api/v1/assets/${asset!.id}/process-links/${processId}`,
            );
            await relationshipPage.goto(`/assets/${asset!.id}`);
            await waitForDataLoad(relationshipPage);
            await expect(relationshipPage.getByTestId(`asset-process-link-primary-${processId}`)).toHaveCount(0);
            await approveRequest(croPage, assetUpdateReason);
            await relationshipPage.reload();
            await waitForDataLoad(relationshipPage);
            await expect(relationshipPage.getByTestId(`asset-process-link-primary-${processId}`)).toBeVisible();

            const assetRemoveReason = `Approve protected Asset link remove ${processName}`;
            await submitGovernedDialog(
                relationshipPage,
                assetRemoveReason,
                () => relationshipPage.getByTestId(`asset-process-link-remove-${processId}`).click(),
                (response) => response.request().method() === 'DELETE'
                    && new URL(response.url()).pathname === `/api/v1/assets/${asset!.id}/process-links/${processId}`,
            );
            await relationshipPage.goto(`/assets/${asset!.id}`);
            await waitForDataLoad(relationshipPage);
            await expect(relationshipPage.getByTestId('asset-process-links').getByText(processName)).toBeVisible();
            await approveRequest(croPage, assetRemoveReason);
            await relationshipPage.reload();
            await waitForDataLoad(relationshipPage);
            await expect(relationshipPage.getByTestId('asset-process-links').getByText(processName)).toHaveCount(0);

            // Vendor -> Process add/remove behaves identically and keeps the row
            // absent/present respectively until the approver accepts the proposal.
            if (!relationshipPage.isClosed()) await relationshipContext.close();
            relationshipContext = await browser.newContext();
            relationshipPage = await relationshipContext.newPage();
            await loginAsDemoUser(relationshipPage, DEMO_ACCOUNTS.RISK_MANAGER);
            await relationshipPage.goto(`/vendors/${vendor!.id}`);
            await waitForDataLoad(relationshipPage);
            await selectExactOption(relationshipPage, 'vendor-process-link-select', processName);
            const vendorAddReason = `Approve protected Vendor link add ${processName}`;
            await submitGovernedDialog(
                relationshipPage,
                vendorAddReason,
                () => relationshipPage.getByTestId('vendor-process-link-add').click(),
                (response) => response.request().method() === 'POST'
                    && new URL(response.url()).pathname === `/api/v1/processes/${processId}/vendor-links`,
            );
            await relationshipPage.goto(`/vendors/${vendor!.id}`);
            await waitForDataLoad(relationshipPage);
            await expect(relationshipPage.getByTestId('vendor-process-links').getByText(processName)).toHaveCount(0);
            await approveRequest(croPage, vendorAddReason);
            await relationshipPage.reload();
            await waitForDataLoad(relationshipPage);
            const vendorRow = relationshipPage.getByTestId('vendor-process-links').getByRole('listitem').filter({ hasText: processName });
            await expect(vendorRow).toBeVisible();

            const vendorRemoveReason = `Approve protected Vendor link remove ${processName}`;
            await submitGovernedDialog(
                relationshipPage,
                vendorRemoveReason,
                () => vendorRow.locator('[data-testid^="vendor-process-link-remove-"]').click(),
                (response) => response.request().method() === 'DELETE'
                    && new RegExp(`/api/v1/processes/${processId}/vendor-links/\\d+$`).test(
                        new URL(response.url()).pathname,
                    ),
            );
            await relationshipPage.goto(`/vendors/${vendor!.id}`);
            await waitForDataLoad(relationshipPage);
            await expect(relationshipPage.getByTestId('vendor-process-links').getByText(processName)).toBeVisible();
            await approveRequest(croPage, vendorRemoveReason);
            await relationshipPage.reload();
            await waitForDataLoad(relationshipPage);
            await expect(relationshipPage.getByTestId('vendor-process-links').getByText(processName)).toHaveCount(0);
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            if (relationshipContext && relationshipPage && !relationshipPage.isClosed()) {
                await relationshipContext.close();
            }
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => cleanupGovernedProcessFixture({ processName, assetPrimaryBaseline }),
                test.info(),
            );
        }
    });
});
