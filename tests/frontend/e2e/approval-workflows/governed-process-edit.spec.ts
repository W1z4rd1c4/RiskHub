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
import { getApiBaseUrl, getDemoToken, getVendorByRegistration } from '../helpers/api-auth';
import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from '../helpers/axeBaseline';
import {
    cleanupGovernedProcessFixture,
    cleanupWithoutMaskingPrimaryFailure,
    createAssetViaApi,
    createAssetVendorLinkViaApi,
    createProcessViaApi,
    ensureAssetArchived,
    ensureProcessArchived,
    getApprovalScenario,
    removeAssetVendorLinkTuple,
    runCleanupSteps,
    updateApprovalScenario,
} from '../helpers/ict-register';
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

interface CompositeState {
    cif: string;
    criticality?: string | null;
    tier?: string | null;
}

async function getCompositeState(
    resource: 'processes' | 'assets' | 'vendors',
    id: number,
): Promise<CompositeState> {
    const token = await getDemoToken({
        email: 'risk.manager@riskhub.local',
        fallbackUserIds: [3],
    });
    const response = await fetch(`${getApiBaseUrl()}/api/v1/${resource}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`Failed to load ${resource}/${id}: ${response.status}`);
    }
    const body = await response.json() as {
        derived: {
            cif: string;
            criticality_class?: string | null;
            resulting_criticality?: string | null;
            tier?: string | null;
        };
    };
    return {
        cif: body.derived.cif,
        criticality: body.derived.criticality_class ?? body.derived.resulting_criticality,
        tier: body.derived.tier,
    };
}

async function createPrimaryProcessLink(assetId: number, processId: number): Promise<void> {
    const token = await getDemoToken({
        email: 'risk.manager@riskhub.local',
        fallbackUserIds: [3],
    });
    const response = await fetch(`${getApiBaseUrl()}/api/v1/assets/${assetId}/process-links`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ process_id: processId, is_primary: true }),
    });
    if (response.status !== 201) {
        throw new Error(`Failed to create primary Process link: ${response.status} - ${await response.text()}`);
    }
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
            await expect(riskManagerPage).toHaveURL(new RegExp(`/processes/${created.id}/edit(?:\\?.*)?$`));

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

    test('Process edit reviews and atomically applies primary Asset and downstream Vendor impact', async ({
        riskManagerPage,
        croPage,
    }) => {
        const stamp = Date.now();
        const processName = `E2E-COMPOSITE-PROCESS-${stamp}`;
        const assetName = `E2E-COMPOSITE-ASSET-${stamp}`;
        const reason = `Apply composite impact ${stamp}`;
        const ictServiceCode = 'S01';
        const vendor = await getVendorByRegistration('E2E-VREG-006');
        expect(vendor).not.toBeNull();
        const assetScenario = await getApprovalScenario('protected_asset_edit');
        const vendorScenario = await getApprovalScenario('protected_vendor_edit');
        let process: Awaited<ReturnType<typeof createProcessViaApi>> | null = null;
        let asset: Awaited<ReturnType<typeof createAssetViaApi>> | null = null;
        let primaryFailure: unknown;

        try {
            process = await createProcessViaApi({
                l0_area: 'Composite evidence',
                l1_process: processName,
                preliminary_criticality: 'low',
                cif_override: 'no',
            });
            asset = await createAssetViaApi({
                name: assetName,
                preliminary_criticality: 'low',
            });
            await createPrimaryProcessLink(asset.id, process.id);
            await createAssetVendorLinkViaApi(asset.id, {
                vendor_id: vendor!.id,
                ict_service_code: ictServiceCode,
            });

            expect((await getCompositeState('processes', process.id)).cif).toBe('no');
            expect((await getCompositeState('assets', asset.id)).cif).toBe('no');
            expect((await getCompositeState('assets', asset.id)).criticality).toBe('low');
            expect((await getCompositeState('vendors', vendor!.id)).tier).toBe('standard');

            await riskManagerPage.goto(`/processes/${process.id}/edit`);
            await waitForDataLoad(riskManagerPage);
            await riskManagerPage.getByTestId('process-form-preliminary-criticality').click();
            await riskManagerPage.getByRole('option', { name: /Critical|Kritická/, exact: true }).click();
            await riskManagerPage.getByTestId('process-form-cif-override').click();
            await riskManagerPage.getByRole('option', { name: /Yes|Ano/, exact: true }).click();
            await riskManagerPage.getByTestId('process-form-request-reason').fill(reason);
            const queued = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'PATCH'
                && new URL(response.url()).pathname === `/api/v1/processes/${process.id}`
            ));
            await riskManagerPage.getByTestId('process-form-submit').click();
            expect((await queued).status()).toBe(202);

            const requesterApprovals = new ApprovalsPage(riskManagerPage);
            await requesterApprovals.navigate();
            await requesterApprovals.selectMyRequests();
            const requesterIndex = await requesterApprovals.findCardByReason(reason);
            await requesterApprovals.expandChanges(requesterIndex);
            const reviewCard = requesterApprovals.getCard(requesterIndex);
            const derivedImpact = reviewCard.getByRole('region', { name: 'Derived impact' });
            const processImpact = derivedImpact.getByRole('heading', { name: processName }).locator('..');
            const assetImpact = derivedImpact.getByRole('heading', { name: assetName }).locator('..');
            const vendorImpact = derivedImpact.getByRole('heading', {
                name: 'E2E-VENDOR-006 Finance Reporting SaaS',
            }).locator('..');
            await expect(processImpact).toHaveCount(1);
            await expect(processImpact.getByText('No', { exact: true })).toBeVisible();
            await expect(processImpact.getByText('Yes', { exact: true })).toBeVisible();
            await expect(processImpact.getByText('Low', { exact: true })).toBeVisible();
            await expect(processImpact.getByText('Critical', { exact: true })).toBeVisible();
            await expect(assetImpact).toHaveCount(1);
            await expect(assetImpact.getByText('No', { exact: true })).toBeVisible();
            await expect(assetImpact.getByText('Yes', { exact: true })).toBeVisible();
            await expect(assetImpact.getByText('Low', { exact: true })).toBeVisible();
            await expect(assetImpact.getByText('Critical', { exact: true })).toBeVisible();
            await expect(vendorImpact).toHaveCount(1);
            await expect(vendorImpact.getByText('Standard provider', { exact: true })).toBeVisible();
            await expect(vendorImpact.getByText('Critical provider', { exact: true })).toBeVisible();

            expect((await getCompositeState('processes', process.id)).cif).toBe('no');
            expect((await getCompositeState('assets', asset.id)).cif).toBe('no');
            expect((await getCompositeState('assets', asset.id)).criticality).toBe('low');
            expect((await getCompositeState('vendors', vendor!.id)).tier).toBe('standard');

            const resolverApprovals = new ApprovalsPage(croPage);
            await resolverApprovals.navigate();
            const resolverIndex = await resolverApprovals.findCardByReason(reason);
            await resolverApprovals.clickApprove(resolverIndex);
            await resolverApprovals.submitResolution(`Approve ${reason}`, 'approve');

            await expect.poll(async () => (await getCompositeState('processes', process.id)).cif)
                .toBe('yes');
            const assetState = await getCompositeState('assets', asset.id);
            expect(assetState.cif).toBe('yes');
            expect(assetState.criticality).toBe('critical');
            expect((await getCompositeState('vendors', vendor!.id)).tier).toBe('critical');
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => runCleanupSteps('Failed to restore composite Process fixture', [
                    () => updateApprovalScenario('protected_asset_edit', {
                        requires_approval: false,
                        approver_roles: assetScenario.approver_roles,
                    }),
                    () => updateApprovalScenario('protected_vendor_edit', {
                        requires_approval: false,
                        approver_roles: vendorScenario.approver_roles,
                    }),
                    () => cleanupGovernedProcessFixture({ processName }),
                    ...(asset === null ? [] : [
                        () => removeAssetVendorLinkTuple(asset!.id, vendor!.id, ictServiceCode),
                        () => ensureAssetArchived(assetName, true).then(() => undefined),
                    ]),
                    () => updateApprovalScenario('protected_vendor_edit', vendorScenario),
                    () => updateApprovalScenario('protected_asset_edit', assetScenario),
                ]),
                test.info(),
            );
        }
    });
});
