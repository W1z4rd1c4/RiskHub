import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/auth.fixture';
import {
    getApiBaseUrl,
    getDemoTokenByAccountName,
    listNotificationsByAccountName,
    waitForNotificationByAccountName,
} from '../helpers/api-auth';
import {
    cleanupGovernedProcessFixture,
    cleanupWithoutMaskingPrimaryFailure,
    runCleanupSteps,
} from '../helpers/ict-register';
import { waitForDataLoad } from '../helpers/wait';
import { ApprovalsPage } from '../pages/ApprovalsPage';

const ACTION_REQUIRED_LABEL = 'Governed requests requiring my action';
const REQUEST_UPDATES_LABEL = 'Updates to my governed requests';

interface RuntimeErrors {
    pageErrors: string[];
    serverErrors: string[];
}

function collectRuntimeErrors(page: Page): RuntimeErrors {
    const errors: RuntimeErrors = { pageErrors: [], serverErrors: [] };
    page.on('pageerror', (error) => errors.pageErrors.push(error.message));
    page.on('response', (response) => {
        if (response.status() >= 500) {
            errors.serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
        }
    });
    return errors;
}

async function openNotificationPreferences(page: Page): Promise<void> {
    await page.goto('/settings');
    await waitForDataLoad(page);
    await page.getByTestId('settings-tab-notifications').click();
    await expect(page.getByRole('switch', { name: ACTION_REQUIRED_LABEL })).toBeVisible();
}

async function setPreference(page: Page, label: string, enabled: boolean): Promise<void> {
    const toggle = page.getByRole('switch', { name: label });
    const current = await toggle.getAttribute('aria-checked');
    if ((current === 'true') !== enabled) {
        const saved = page.waitForResponse((response) => (
            response.request().method() === 'PUT'
            && new URL(response.url()).pathname === '/api/v1/notifications/preferences'
        ));
        await toggle.click();
        expect((await saved).status()).toBe(200);
    }
    await expect(toggle).toHaveAttribute('aria-checked', String(enabled));
    await page.reload();
    await page.getByTestId('settings-tab-notifications').click();
    await expect(page.getByRole('switch', { name: label }))
        .toHaveAttribute('aria-checked', String(enabled));
}

async function submitProtectedCreation(page: Page, processName: string, reason: string): Promise<void> {
    await page.goto('/processes/new');
    await waitForDataLoad(page);
    await page.getByTestId('process-form-l0-area').fill('Notification evidence');
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
}

async function approveByReason(page: Page, reason: string): Promise<void> {
    const approvals = new ApprovalsPage(page);
    await approvals.navigate();
    await approvals.selectPendingQueue();
    const index = await approvals.findCardByReason(reason);
    expect(index).toBeGreaterThanOrEqual(0);
    await approvals.clickApprove(index);
    const resolved = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && /\/api\/v1\/approvals\/\d+\/approve$/.test(new URL(response.url()).pathname)
    ));
    await approvals.submitResolution(`Approve ${reason}`, 'approve');
    expect((await resolved).status()).toBe(200);
}

async function waitForOutboxIdle(): Promise<void> {
    const token = await getDemoTokenByAccountName('System Admin');
    await expect.poll(async () => {
        const response = await fetch(`${getApiBaseUrl()}/api/v1/admin/outbox/status`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(response.status).toBe(200);
        const status = await response.json() as { pending_count: number; processing_count: number };
        return status.pending_count + status.processing_count;
    }, { timeout: 15_000 }).toBe(0);
}

async function updatePreferenceByAccountName(
    accountName: string,
    preference: 'governed_approval_action_required' | 'governed_approval_request_updates',
    enabled: boolean,
): Promise<void> {
    const token = await getDemoTokenByAccountName(accountName);
    const response = await fetch(`${getApiBaseUrl()}/api/v1/notifications/preferences`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [preference]: enabled }),
    });
    expect(response.status).toBe(200);
    const preferences = await response.json() as Record<string, boolean>;
    expect(preferences[preference]).toBe(enabled);
}

async function getPreferenceByAccountName(
    accountName: string,
    preference: 'governed_approval_action_required' | 'governed_approval_request_updates',
): Promise<boolean> {
    const token = await getDemoTokenByAccountName(accountName);
    const response = await fetch(`${getApiBaseUrl()}/api/v1/notifications/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    const preferences = await response.json() as Record<string, boolean>;
    return preferences[preference];
}

async function openNotificationInbox(page: Page): Promise<void> {
    const pageLoaded = page.waitForResponse((response) => (
        response.request().method() === 'GET'
        && new URL(response.url()).pathname === '/api/v1/notifications'
        && new URL(response.url()).searchParams.get('limit') === '20'
    ));
    await page.getByTestId('notification-bell-button').click();
    await page.getByTestId('notification-view-all-button').click();
    expect((await pageLoaded).status()).toBe(200);
}

test.describe('Governed notification preferences', () => {

    test('governed defaults persist while disabled delivery leaves Pending Queue, My Requests, and History authoritative', async ({
        riskManagerPage,
        croPage,
    }) => {
        const stamp = Date.now();
        const disabledProcess = `E2E-NOTIFY-OFF-${stamp}`;
        const disabledReason = `Disabled governed delivery ${disabledProcess}`;
        const riskManagerErrors = collectRuntimeErrors(riskManagerPage);
        const croErrors = collectRuntimeErrors(croPage);
        const croPreferenceBaseline = await getPreferenceByAccountName(
            'Anna Kowalski',
            'governed_approval_action_required',
        );
        const requesterPreferenceBaseline = await getPreferenceByAccountName(
            'Petra Svobodová',
            'governed_approval_request_updates',
        );
        let primaryFailure: unknown;

        try {
            await openNotificationPreferences(croPage);
            await expect(croPage.getByRole('switch', { name: ACTION_REQUIRED_LABEL }))
                .toHaveAttribute('aria-checked', 'true');
            await openNotificationPreferences(riskManagerPage);
            await expect(riskManagerPage.getByRole('switch', { name: REQUEST_UPDATES_LABEL }))
                .toHaveAttribute('aria-checked', 'true');

            await setPreference(croPage, ACTION_REQUIRED_LABEL, false);
            await setPreference(riskManagerPage, REQUEST_UPDATES_LABEL, false);

            await submitProtectedCreation(riskManagerPage, disabledProcess, disabledReason);
            const requesterApprovals = new ApprovalsPage(riskManagerPage);
            await requesterApprovals.selectMyRequests();
            expect(await requesterApprovals.findCardByReason(disabledReason)).toBeGreaterThanOrEqual(0);

            const resolverApprovals = new ApprovalsPage(croPage);
            await approveByReason(croPage, disabledReason);
            await resolverApprovals.selectHistory();
            expect(await resolverApprovals.findCardByReason(disabledReason)).toBeGreaterThanOrEqual(0);

            await waitForOutboxIdle();
            const [disabledCroNotifications, disabledRiskManagerNotifications] = await Promise.all([
                listNotificationsByAccountName('Anna Kowalski'),
                listNotificationsByAccountName('Petra Svobodová'),
            ]);
            expect(disabledCroNotifications.some((notification) => (
                notification.type === 'governed_approval_action_required'
                && notification.message.includes(disabledProcess)
            ))).toBe(false);
            expect(disabledRiskManagerNotifications.some((notification) => (
                notification.type === 'governed_approval_request_updates'
                && notification.message.includes(disabledProcess)
            ))).toBe(false);
            expect(riskManagerErrors.pageErrors).toEqual([]);
            expect(riskManagerErrors.serverErrors).toEqual([]);
            expect(croErrors.pageErrors).toEqual([]);
            expect(croErrors.serverErrors).toEqual([]);
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => runCleanupSteps('Failed to clean up disabled governed notification preferences', [
                    () => cleanupGovernedProcessFixture({ processName: disabledProcess }),
                    () => updatePreferenceByAccountName(
                        'Anna Kowalski',
                        'governed_approval_action_required',
                        croPreferenceBaseline,
                    ),
                    () => updatePreferenceByAccountName(
                        'Petra Svobodová',
                        'governed_approval_request_updates',
                        requesterPreferenceBaseline,
                    ),
                ]),
                test.info(),
            );
        }
    });

    test('enabled delivery reaches the resolver inbox before approval and requester inbox after approval', async ({
        riskManagerPage,
        croPage,
    }) => {
        const enabledProcess = `E2E-NOTIFY-ON-${Date.now()}`;
        const enabledReason = `Enabled governed delivery ${enabledProcess}`;
        const riskManagerErrors = collectRuntimeErrors(riskManagerPage);
        const croErrors = collectRuntimeErrors(croPage);
        const croPreferenceBaseline = await getPreferenceByAccountName(
            'Anna Kowalski',
            'governed_approval_action_required',
        );
        const requesterPreferenceBaseline = await getPreferenceByAccountName(
            'Petra Svobodová',
            'governed_approval_request_updates',
        );
        let primaryFailure: unknown;

        try {
            await updatePreferenceByAccountName(
                'Anna Kowalski',
                'governed_approval_action_required',
                true,
            );
            await updatePreferenceByAccountName(
                'Petra Svobodová',
                'governed_approval_request_updates',
                true,
            );
            await submitProtectedCreation(riskManagerPage, enabledProcess, enabledReason);
            await waitForOutboxIdle();
            const actionNotification = await waitForNotificationByAccountName(
                'Anna Kowalski',
                (notification) => notification.type === 'governed_approval_action_required'
                    && notification.message.includes(enabledProcess),
            );
            expect(actionNotification.is_read).toBe(false);
            await openNotificationInbox(croPage);
            await expect(croPage.getByText(enabledProcess).first()).toBeVisible();

            await approveByReason(croPage, enabledReason);
            await waitForOutboxIdle();
            const requesterNotification = await waitForNotificationByAccountName(
                'Petra Svobodová',
                (notification) => notification.type === 'governed_approval_request_updates'
                    && notification.message.includes(enabledProcess),
            );
            expect(requesterNotification.is_read).toBe(false);

            await openNotificationInbox(riskManagerPage);
            await expect(riskManagerPage.getByText(enabledProcess).first()).toBeVisible();
            expect(riskManagerErrors.pageErrors).toEqual([]);
            expect(riskManagerErrors.serverErrors).toEqual([]);
            expect(croErrors.pageErrors).toEqual([]);
            expect(croErrors.serverErrors).toEqual([]);
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => runCleanupSteps('Failed to clean up enabled governed notification preferences', [
                    () => cleanupGovernedProcessFixture({ processName: enabledProcess }),
                    () => updatePreferenceByAccountName(
                        'Anna Kowalski',
                        'governed_approval_action_required',
                        croPreferenceBaseline,
                    ),
                    () => updatePreferenceByAccountName(
                        'Petra Svobodová',
                        'governed_approval_request_updates',
                        requesterPreferenceBaseline,
                    ),
                ]),
                test.info(),
            );
        }
    });
});
