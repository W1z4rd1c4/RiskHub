/** Ticket #100 — protected Vendor Risk/Control/KRI link changes are governed. */
import { expect, test } from '../fixtures/auth.fixture';
import { E2E_ICT_VENDOR, E2E_RISKS } from '../fixtures/e2e-data';
import {
    getApiBaseUrl,
    getDemoToken,
    getRiskByCode,
    getVendorByRegistration,
} from '../helpers/api-auth';
import {
    cancelPendingApprovalsForMarker,
    cleanupWithoutMaskingPrimaryFailure,
    runCleanupSteps,
} from '../helpers/ict-register';
import { waitForDataLoad } from '../helpers/wait';
import { ApprovalsPage } from '../pages/ApprovalsPage';

const LINK_RISK = E2E_RISKS.ARCHIVE_ACTIVE_PAIR;
/** The risk-link search result renders the Risk DESCRIPTION as its title. */
const LINK_RISK_RESULT_TITLE = /Archive matrix active risk counterpart/i;

async function riskManagerHeaders(): Promise<Record<string, string>> {
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function listLinkedRiskIds(vendorId: number, headers: Record<string, string>): Promise<number[]> {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/vendors/${vendorId}/linked-risks`, {
        headers,
    });
    if (!response.ok) {
        throw new Error(`Failed to list Vendor ${vendorId} Risk links: ${response.status}`);
    }
    return ((await response.json()) as Array<{ id: number }>).map((risk) => risk.id);
}

/** Approve a queued (202) governed fixture mutation with an independent CRO. */
async function approveQueuedMutation(response: globalThis.Response, reason: string): Promise<void> {
    const queued = await response.json() as { approval_id: number };
    const token = await getDemoToken({ email: 'cro@riskhub.local', fallbackUserIds: [2] });
    const approved = await fetch(`${getApiBaseUrl()}/api/v1/approvals/${queued.approval_id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_notes: `Approve ${reason}` }),
    });
    if (!approved.ok) {
        throw new Error(`Failed to approve queued Vendor link mutation: ${approved.status} ${await approved.text()}`);
    }
}

async function ensureVendorRiskUnlinked(
    vendorId: number,
    riskId: number,
    headers: Record<string, string>,
): Promise<void> {
    if (!(await listLinkedRiskIds(vendorId, headers)).includes(riskId)) {
        return;
    }
    const reason = `Restore Vendor ${vendorId} Risk ${riskId} link truth after #100 E2E`;
    const response = await fetch(`${getApiBaseUrl()}/api/v1/vendors/${vendorId}/linked-risks/${riskId}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ request_reason: reason }),
    });
    if (response.status === 202) {
        await approveQueuedMutation(response, reason);
    } else if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to unlink Vendor ${vendorId} Risk ${riskId}: ${response.status}`);
    }
    if ((await listLinkedRiskIds(vendorId, headers)).includes(riskId)) {
        throw new Error(`Vendor ${vendorId} still links Risk ${riskId} after cleanup`);
    }
}

test.describe('Governed protected Vendor link workflow (#100)', () => {
    test('Risk link on a protected Vendor queues with a reason and applies only after independent approval', async ({
        riskManagerPage,
        croPage,
    }) => {
        const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
        expect(vendor).not.toBeNull();
        const risk = await getRiskByCode(LINK_RISK.code);
        expect(risk).not.toBeNull();
        // Authenticate the API helper role ONCE; every helper call reuses it.
        const rmHeaders = await riskManagerHeaders();
        const reason = `Link protected Vendor Risk ${Date.now()}`;
        let primaryFailure: unknown;

        try {
            // Self-heal: a crashed earlier run may have left the approved link behind.
            await ensureVendorRiskUnlinked(vendor!.id, risk!.id, rmHeaders);

            // (1) Submit the protected link mutation with a collected reason.
            await riskManagerPage.goto(`/vendors/${vendor!.id}`);
            await waitForDataLoad(riskManagerPage);
            const linkedRisksSection = riskManagerPage.locator('#vendor-linked-risks');
            await expect(linkedRisksSection).toBeVisible({ timeout: 15000 });
            await linkedRisksSection.getByRole('button', { name: /Link Existing|Propojit existující/i }).click();

            const linkDialog = riskManagerPage.getByTestId('link-management-dialog');
            await expect(linkDialog).toBeVisible({ timeout: 15000 });
            await linkDialog.getByPlaceholder(/Search risks|Hledat rizika/i).fill(LINK_RISK.name);
            await linkDialog.getByRole('button', { name: LINK_RISK_RESULT_TITLE }).click();
            await linkDialog.getByRole('button', { name: /Create Link|Vytvořit propojení/i }).click();

            const reasonDialog = riskManagerPage.getByRole('alertdialog');
            await expect(reasonDialog).toBeVisible({ timeout: 15000 });
            await reasonDialog.getByRole('textbox').fill(reason);
            const queued = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'POST'
                && new URL(response.url()).pathname === `/api/v1/vendors/${vendor!.id}/linked-risks`
            ));
            await reasonDialog.getByRole('button', { name: /Continue|Pokračovat/ }).click();

            // (2) The 202 is treated as QUEUED, never as success: the requester
            // lands on the surfaced approval instead of a refreshed link list.
            expect((await queued).status()).toBe(202);
            await expect(riskManagerPage).toHaveURL(/\/approvals\?tab=mine&approvalId=\d+/);

            // (3) Pre-approval link truth is UNCHANGED in API and UI.
            expect(await listLinkedRiskIds(vendor!.id, rmHeaders)).not.toContain(risk!.id);
            await riskManagerPage.goto(`/vendors/${vendor!.id}`);
            await waitForDataLoad(riskManagerPage);
            await expect(riskManagerPage.locator('#vendor-linked-risks')).toBeVisible({ timeout: 15000 });
            await expect(
                riskManagerPage.locator('#vendor-linked-risks').getByText(LINK_RISK.name),
            ).toHaveCount(0);

            // (4) An authorized independent approver approves the request.
            const resolverApprovals = new ApprovalsPage(croPage);
            await resolverApprovals.navigate();
            const resolverIndex = await resolverApprovals.findCardByReason(reason);
            await resolverApprovals.clickApprove(resolverIndex);
            await resolverApprovals.submitResolution(`Approve ${reason}`, 'approve');

            // (5) Post-approval truth changes correctly in API and UI.
            await expect.poll(
                async () => listLinkedRiskIds(vendor!.id, rmHeaders),
                { timeout: 15000 },
            ).toContain(risk!.id);
            await riskManagerPage.goto(`/vendors/${vendor!.id}`);
            await waitForDataLoad(riskManagerPage);
            await expect(
                riskManagerPage.locator('#vendor-linked-risks').getByText(LINK_RISK.name).first(),
            ).toBeVisible({ timeout: 15000 });
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => runCleanupSteps('Failed to restore protected Vendor link fixture', [
                    () => cancelPendingApprovalsForMarker(reason),
                    () => ensureVendorRiskUnlinked(vendor!.id, risk!.id, rmHeaders),
                ]),
                test.info(),
            );
        }
    });
});
