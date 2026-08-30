import type { Dialog, Page, Request } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';
import { E2E_CONTROLS, E2E_ICT_VENDOR, E2E_VENDORS } from './fixtures/e2e-data';
import { getControlByName, getVendorByRegistration } from './helpers/api-auth';

const VIEWPORT = { width: 1440, height: 900 };

function isRequest(request: Request, method: string, pathname: string): boolean {
    return request.method() === method && new URL(request.url()).pathname === pathname;
}

function currentPath(page: Page): string {
    const url = new URL(page.url());
    return `${url.pathname}${url.search}${url.hash}`;
}

async function dismissNativeReload(page: Page): Promise<void> {
    let observed: Dialog | null = null;
    let resolveDismissed!: () => void;
    const dismissed = new Promise<void>((resolve) => { resolveDismissed = resolve; });
    page.once('dialog', async (dialog) => {
        observed = dialog;
        await dialog.dismiss();
        resolveDismissed();
    });
    await page.evaluate(() => {
        window.setTimeout(() => window.location.reload(), 0);
    });
    await expect.poll(() => observed?.type()).toBe('beforeunload');
    await dismissed;
}

test.describe('Issue #158 truthful outcomes and dirty-task browser acceptance', () => {
    test.beforeEach(async ({ riskManagerPage }) => {
        await riskManagerPage.setViewportSize(VIEWPORT);
    });

    test('Notifications initial failure keeps the exact URL and focus until Retry recovers real content', async ({
        riskManagerPage,
    }) => {
        const notificationUrl = '/notifications?tab=unread&source=ux158';
        const recoveredTitle = 'UX158 notification recovery';
        let attempts = 0;
        let recoveryEnabled = false;
        let releaseRetry!: () => void;
        const retryGate = new Promise<void>((resolve) => { releaseRetry = resolve; });

        await riskManagerPage.route('**/api/v1/notifications**', async (route, request) => {
            if (!isRequest(request, 'GET', '/api/v1/notifications')) {
                await route.continue();
                return;
            }
            attempts += 1;
            if (!recoveryEnabled) {
                await route.fulfill({ status: 500, json: { detail: 'raw notification failure must not leak' } });
                return;
            }
            await retryGate;
            await route.fulfill({
                status: 200,
                json: {
                    items: [{
                        id: 158001,
                        type: 'issue_due_soon',
                        title: recoveredTitle,
                        message: 'The retry returned a trustworthy notification.',
                        resource_type: 'issue',
                        resource_id: 158001,
                        is_read: false,
                        created_at: '2026-08-30T10:00:00Z',
                        expires_at: null,
                    }],
                    total: 1,
                    skip: 0,
                    limit: 20,
                    unread_count: 1,
                },
            });
        });

        await riskManagerPage.goto(notificationUrl);
        const alert = riskManagerPage.getByRole('alert');
        await expect(alert).toBeVisible();
        await expect(alert).not.toContainText('raw notification failure must not leak');
        await expect(riskManagerPage.getByText(/No notifications|Žádná oznámení|All caught up|Vše přečteno/i)).toHaveCount(0);
        expect(currentPath(riskManagerPage)).toBe(notificationUrl);

        const retry = alert.getByRole('button', { name: /Retry|Zkusit znovu/i });
        await retry.focus();
        const attemptsBeforeRetry = attempts;
        recoveryEnabled = true;
        await riskManagerPage.keyboard.press('Enter');
        await expect.poll(() => attempts).toBeGreaterThan(attemptsBeforeRetry);
        await expect(retry).toBeFocused();
        await expect(retry).toHaveAttribute('aria-busy', 'true');
        expect(currentPath(riskManagerPage)).toBe(notificationUrl);

        releaseRetry();
        await expect(riskManagerPage.getByText(recoveredTitle)).toBeVisible();
        await expect(alert).toHaveCount(0);
        await expect(riskManagerPage.getByText(/No notifications|Žádná oznámení/i)).toHaveCount(0);
        expect(currentPath(riskManagerPage)).toBe(notificationUrl);
    });

    test('Vendor linked Risks fail locally while sibling regions remain truthful and only local Retry recomputes exposure', async ({
        riskManagerPage,
    }) => {
        const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
        if (!vendor) throw new Error(`Required Vendor fixture ${E2E_ICT_VENDOR.registration_id} is missing`);
        const vendorUrl = `/vendors/${vendor.id}?return_to=${encodeURIComponent('/vendors?q=E2E-VENDOR&page=2#vendors-table')}`;
        const paths = {
            risks: `/api/v1/vendors/${vendor.id}/linked-risks`,
            controls: `/api/v1/vendors/${vendor.id}/linked-controls`,
            kris: `/api/v1/vendors/${vendor.id}/linked-kris`,
        };
        const attempts = { risks: 0, controls: 0, kris: 0 };
        let riskRecoveryEnabled = false;

        for (const kind of ['risks', 'controls', 'kris'] as const) {
            await riskManagerPage.route(`**${paths[kind]}**`, async (route, request) => {
                if (!isRequest(request, 'GET', paths[kind])) {
                    await route.continue();
                    return;
                }
                attempts[kind] += 1;
                if (kind === 'risks' && !riskRecoveryEnabled) {
                    await route.fulfill({ status: 500, json: { detail: 'raw linked-risk failure' } });
                    return;
                }
                await route.continue();
            });
        }

        await riskManagerPage.goto(vendorUrl);
        const riskRegion = riskManagerPage.locator('#vendor-linked-risks');
        const controlRegion = riskManagerPage.locator('#vendor-linked-controls');
        const kriRegion = riskManagerPage.locator('#vendor-linked-kris');
        const riskAlert = riskRegion.getByRole('alert');
        await expect(riskAlert).toBeVisible();
        await expect(riskAlert).not.toContainText('raw linked-risk failure');
        await expect(controlRegion).toBeVisible();
        await expect(kriRegion).toBeVisible();
        await expect(controlRegion.getByRole('alert')).toHaveCount(0);
        await expect(kriRegion.getByRole('alert')).toHaveCount(0);
        await expect(riskManagerPage.getByText(/Linked exposure|Navázaná expozice/i)).toHaveCount(0);
        expect(currentPath(riskManagerPage)).toBe(vendorUrl);

        const siblingAttempts = { controls: attempts.controls, kris: attempts.kris };
        const riskAttemptsBeforeRetry = attempts.risks;
        const retry = riskAlert.getByRole('button', { name: /Retry|Zkusit znovu/i });
        await retry.focus();
        riskRecoveryEnabled = true;
        await Promise.all([
            riskManagerPage.waitForResponse((response) => (
                isRequest(response.request(), 'GET', paths.risks) && response.ok()
            )),
            riskManagerPage.keyboard.press('Enter'),
        ]);

        await expect(riskAlert).toHaveCount(0);
        await expect(riskManagerPage.getByText(/Linked exposure|Navázaná expozice/i).first()).toBeVisible();
        expect(attempts.controls).toBe(siblingAttempts.controls);
        expect(attempts.kris).toBe(siblingAttempts.kris);
        expect(attempts.risks).toBeGreaterThan(riskAttemptsBeforeRetry);
        expect(currentPath(riskManagerPage)).toBe(vendorUrl);
    });

    test('Control edit unavailable state never leaks detail and preserves exact Retry and safe Back destinations', async ({
        riskManagerPage,
    }) => {
        const control = await getControlByName(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);
        if (!control) throw new Error(`Required Control fixture ${E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name} is missing`);
        const returnTo = '/controls?q=operations&page=3#controls-table';
        const editUrl = `/controls/${control.id}/edit?return_to=${encodeURIComponent(returnTo)}`;
        const controlPath = `/api/v1/controls/${control.id}`;
        const rawDetail = 'raw Control backend failure must not leak';
        let failLoads = true;

        await riskManagerPage.route(`**${controlPath}`, async (route, request) => {
            if (!isRequest(request, 'GET', controlPath)) {
                await route.continue();
                return;
            }
            if (failLoads) {
                await route.fulfill({ status: 500, json: { detail: rawDetail } });
                return;
            }
            await route.continue();
        });

        await riskManagerPage.goto(editUrl);
        let unavailable = riskManagerPage.getByTestId('detail-load-unavailable');
        await expect(unavailable).toBeVisible();
        await expect(unavailable).not.toContainText(rawDetail);
        expect(currentPath(riskManagerPage)).toBe(editUrl);
        await unavailable.getByRole('button', { name: /Control Catalog|Katalog kontrol/i }).click();
        await expect.poll(() => currentPath(riskManagerPage)).toBe(returnTo);

        await riskManagerPage.goto(editUrl);
        unavailable = riskManagerPage.getByTestId('detail-load-unavailable');
        await expect(unavailable).toBeVisible();
        failLoads = false;
        await Promise.all([
            riskManagerPage.waitForResponse((response) => (
                isRequest(response.request(), 'GET', controlPath) && response.ok()
            )),
            unavailable.getByRole('button', { name: /Retry|Zkusit znovu/i }).click(),
        ]);
        await expect(riskManagerPage.getByTestId('control-form-lookups-ready')).toBeAttached();
        await expect(riskManagerPage.getByText(rawDetail)).toHaveCount(0);
        expect(currentPath(riskManagerPage)).toBe(editUrl);
    });

    test('Vendor export failure stays dialog-local and the same action retries to a download without losing the register', async ({
        riskManagerPage,
    }) => {
        const vendorsUrl = '/vendors?q=E2E-VENDOR&source=ux158';
        const exportPath = '/api/v1/vendors/export';
        let attempts = 0;

        await riskManagerPage.route(`**${exportPath}**`, async (route, request) => {
            if (!isRequest(request, 'GET', exportPath)) {
                await route.continue();
                return;
            }
            attempts += 1;
            if (attempts === 1) {
                await route.fulfill({ status: 500, json: { detail: 'raw export failure' } });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'text/csv',
                headers: { 'Content-Disposition': 'attachment; filename="ux158-vendors.csv"' },
                body: 'Name,Registration ID\nUX158 Vendor,E2E-VREG-001\n',
            });
        });

        await riskManagerPage.goto(vendorsUrl);
        await expect(riskManagerPage.getByTestId('vendors-register-shell')).toBeVisible();
        await expect(riskManagerPage.getByTestId('sortable-table-skeleton')).toHaveCount(0);
        const seededRow = riskManagerPage.locator('tr', { hasText: E2E_VENDORS.ACTIVE_PRIMARY.name }).first();
        await expect(seededRow).toBeVisible();
        expect(currentPath(riskManagerPage)).toBe(vendorsUrl);

        await riskManagerPage.getByTestId('vendors-export-button').click();
        const dialog = riskManagerPage.getByTestId('vendors-export-dialog');
        const submit = dialog.getByTestId('export-submit-button');
        const failed = riskManagerPage.waitForResponse((response) => (
            isRequest(response.request(), 'GET', exportPath) && response.status() === 500
        ));
        await submit.click();
        await failed;
        const alert = dialog.getByRole('alert');
        await expect(alert).toBeVisible();
        await expect(alert).not.toContainText('raw export failure');
        await expect(riskManagerPage.getByRole('alert')).toHaveCount(1);
        await expect(dialog).toBeVisible();
        await expect(seededRow).toBeVisible();
        await expect(submit).toBeFocused();
        expect(currentPath(riskManagerPage)).toBe(vendorsUrl);

        const downloadPromise = riskManagerPage.waitForEvent('download');
        const responsePromise = riskManagerPage.waitForResponse((response) => (
            isRequest(response.request(), 'GET', exportPath) && response.ok()
        ));
        await submit.click();
        const [download] = await Promise.all([downloadPromise, responsePromise]);
        expect(download.suggestedFilename()).toBe('ux158-vendors.csv');
        await expect(dialog).toHaveCount(0);
        await expect(seededRow).toBeVisible();
        expect(attempts).toBe(2);
        expect(currentPath(riskManagerPage)).toBe(vendorsUrl);
    });

    test('Control production edit guards validation failure and native or browser exits, then accepts direct and queued saves', async ({
        riskManagerPage,
    }) => {
        const control = await getControlByName(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);
        if (!control) throw new Error(`Required Control fixture ${E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name} is missing`);
        const returnTo = '/controls?q=dirty-task&page=2#controls-table';
        const editUrl = `/controls/${control.id}/edit?return_to=${encodeURIComponent(returnTo)}`;
        const detailUrl = `/controls/${control.id}?return_to=${encodeURIComponent(returnTo)}`;
        const controlPath = `/api/v1/controls/${control.id}`;
        let controlPayload: Record<string, unknown> | null = null;
        let patchAttempts = 0;

        await riskManagerPage.route(`**${controlPath}`, async (route, request) => {
            if (isRequest(request, 'GET', controlPath)) {
                const response = await route.fetch();
                controlPayload = {
                    ...(await response.json() as Record<string, unknown>),
                    process_owner_position: 'UX158 Process Owner',
                    data_source: 'UX158 intercepted control evidence',
                    methodology_reference: 'UX158-METHOD',
                };
                await route.fulfill({ response, json: controlPayload });
                return;
            }
            if (!isRequest(request, 'PATCH', controlPath)) {
                await route.continue();
                return;
            }
            patchAttempts += 1;
            if (patchAttempts === 1) {
                const update = request.postDataJSON() as Record<string, unknown>;
                await route.fulfill({ status: 200, json: { ...controlPayload, ...update } });
                return;
            }
            await route.fulfill({
                status: 202,
                json: {
                    status: 'approval_required',
                    message: 'UX158 Control update queued for approval.',
                    approval_id: 158002,
                    action_type: 'edit',
                    resource_id: control.id,
                    pending_fields: ['name'],
                },
            });
        });

        await riskManagerPage.goto(detailUrl);
        await riskManagerPage.getByRole('button', { name: /Edit Control|Upravit kontrolu/i, exact: true }).click();
        await expect.poll(() => currentPath(riskManagerPage)).toBe(editUrl);
        await expect(riskManagerPage.getByTestId('control-form-lookups-ready')).toBeAttached();
        const identityStep = riskManagerPage.getByRole('button', { name: /Identity|Identita/i, exact: true });
        const linkStep = riskManagerPage.getByRole('button', { name: /Link Risk|Propojit riziko/i, exact: true });
        const name = riskManagerPage.locator('form input[required]').first();
        await name.clear();
        await linkStep.click();
        await riskManagerPage.getByRole('button', { name: /Edit Control|Upravit kontrolu/i, exact: true }).click();
        expect(patchAttempts).toBe(0);

        await riskManagerPage.evaluate(() => window.history.back());
        const guard = riskManagerPage.getByRole('alertdialog');
        await expect(guard).toBeVisible();
        await expect(riskManagerPage).toHaveURL(
            (url) => `${url.pathname}${url.search}${url.hash}` === editUrl,
        );
        await guard.getByRole('button', { name: /Stay|Zůstat/i }).click();
        await identityStep.click();
        await dismissNativeReload(riskManagerPage);
        expect(currentPath(riskManagerPage)).toBe(editUrl);

        await name.fill('UX158 direct-save acceptance');
        await linkStep.click();
        const direct = riskManagerPage.waitForResponse((response) => (
            isRequest(response.request(), 'PATCH', controlPath) && response.status() === 200
        ));
        await riskManagerPage.getByRole('button', { name: /Edit Control|Upravit kontrolu/i, exact: true }).click();
        await direct;
        await expect.poll(() => currentPath(riskManagerPage)).toBe(detailUrl);
        await expect(riskManagerPage.getByRole('alertdialog')).toHaveCount(0);

        await riskManagerPage.getByRole('button', { name: /Edit Control|Upravit kontrolu/i, exact: true }).click();
        await expect.poll(() => currentPath(riskManagerPage)).toBe(editUrl);
        await expect(riskManagerPage.getByTestId('control-form-lookups-ready')).toBeAttached();
        await riskManagerPage.locator('form input[required]').first().fill('UX158 queued-save acceptance');
        await riskManagerPage.getByRole('button', { name: /Link Risk|Propojit riziko/i, exact: true }).click();
        const queued = riskManagerPage.waitForResponse((response) => (
            isRequest(response.request(), 'PATCH', controlPath) && response.status() === 202
        ));
        await riskManagerPage.getByRole('button', { name: /Edit Control|Upravit kontrolu/i, exact: true }).click();
        await queued;
        await expect(riskManagerPage.getByTestId('approval-queued-banner')).toContainText('UX158 Control update queued for approval.');
        await riskManagerPage.evaluate(() => window.history.back());
        await expect.poll(() => currentPath(riskManagerPage)).toBe(detailUrl);
        await expect(riskManagerPage.getByRole('alertdialog')).toHaveCount(0);
    });

    test('Issue remediation keeps dirty progress through tab change and refresh, and protects native unload', async ({
        riskManagerPage,
    }) => {
        const issueId = 158003;
        const issuePath = `/api/v1/issues/${issueId}`;
        const issueUrl = `/issues/${issueId}?tab=workflow&return_to=${encodeURIComponent('/issues?q=ux158#issues-table')}&source=ux158`;
        let serverProgress = 50;
        let issueGets = 0;
        const issuePayload = () => ({
            id: issueId,
            title: 'UX158 remediation truth',
            severity: 'high',
            status: 'in_progress',
            source_type: 'manual',
            source_id: null,
            department_id: 5,
            department_name: 'Risk Management',
            owner_user_id: 3,
            owner_user_name: 'Petra Svobodová',
            opened_at: '2026-08-01T10:00:00Z',
            due_at: '2026-09-30T10:00:00Z',
            closed_at: null,
            created_at: '2026-08-01T10:00:00Z',
            updated_at: '2026-08-30T10:00:00Z',
            risk_contexts: [],
            vendor_contexts: [],
            description: 'Route-intercepted production workflow.',
            created_by_id: 3,
            created_by_name: 'Petra Svobodová',
            validation_note: 'Initial validation',
            links: [],
            remediation_plan: {
                id: 158004,
                issue_id: issueId,
                status: 'active',
                progress_percent: serverProgress,
                owner_user_id: 3,
                owner_user_name: 'Petra Svobodová',
                target_date: '2026-09-30T10:00:00Z',
                blocker_reason: null,
                completion_notes: serverProgress === 50 ? 'Initial completion' : 'Server refreshed completion',
                completed_at: null,
                created_at: '2026-08-01T10:00:00Z',
                updated_at: '2026-08-30T10:00:00Z',
            },
            exceptions: [],
            capabilities: {
                can_read: true, can_update: true, can_change_department: true,
                can_assign_owner: true, can_clear_owner: true, can_start_remediation: true,
                can_update_remediation_progress: true, can_mark_remediation_blocked: true,
                can_mark_remediation_completed: true, can_request_exception: true,
                can_approve_exception: true, can_revoke_exception: true, can_close: true,
                can_link_risk: true, can_link_control: true, can_link_execution: true,
                can_link_kri: true, can_link_vendor: true, can_unlink_entities: true,
                can_view_activity_history: true, can_view_risk_contexts: true,
                can_view_vendor_contexts: true, can_use_department_lookup: true,
                can_use_owner_lookup: true, is_owner: true, is_closed: false,
                has_active_exception: false, has_pending_exception_request: false,
            },
        });

        await riskManagerPage.route(`**${issuePath}`, async (route, request) => {
            if (!isRequest(request, 'GET', issuePath)) {
                await route.continue();
                return;
            }
            issueGets += 1;
            await route.fulfill({ status: 200, json: issuePayload() });
        });
        await riskManagerPage.route('**/api/v1/issues/lookups/owners**', async (route, request) => {
            if (!isRequest(request, 'GET', '/api/v1/issues/lookups/owners')) {
                await route.continue();
                return;
            }
            await route.fulfill({ status: 200, json: [{ id: 3, name: 'Petra Svobodová', role_name: 'Risk Manager', department_name: 'Risk Management' }] });
        });

        await riskManagerPage.goto(issueUrl);
        const progress = riskManagerPage.getByTestId('workflow-progress-card').locator('input[type="number"]');
        await expect(progress).toHaveValue('50');
        await progress.fill('75');
        await riskManagerPage.getByRole('tab', { name: /Overview|Přehled/i }).click();
        const guard = riskManagerPage.getByRole('alertdialog');
        await expect(guard).toBeVisible();
        expect(currentPath(riskManagerPage)).toBe(issueUrl);
        await guard.getByRole('button', { name: /Stay|Zůstat/i }).click();
        await expect(progress).toHaveValue('75');

        serverProgress = 20;
        const refreshed = riskManagerPage.waitForResponse((response) => (
            isRequest(response.request(), 'GET', issuePath) && response.ok()
        ));
        await riskManagerPage.getByRole('button', { name: /Refresh|Obnovit/i, exact: true }).click();
        await refreshed;
        await expect.poll(() => issueGets).toBeGreaterThanOrEqual(2);
        await expect(progress).toHaveValue('75');
        await dismissNativeReload(riskManagerPage);
        expect(currentPath(riskManagerPage)).toBe(issueUrl);
    });
});
