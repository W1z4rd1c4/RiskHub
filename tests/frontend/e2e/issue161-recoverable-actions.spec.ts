import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page, type Route } from '@playwright/test';

import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from './helpers/axeBaseline';

const JOURNEYS = [
    {
        locale: 'en' as const,
        viewport: { width: 1024, height: 768 },
        labels: {
            cancel: 'Cancel',
            cancelRequest: 'Cancel request',
            failure: 'Failed to cancel the pending Asset change.',
            retry: 'Retry',
            terminal: 'This is terminal and cannot be undone.',
        },
    },
    {
        locale: 'cs' as const,
        viewport: { width: 1440, height: 900 },
        labels: {
            cancel: 'Zrušit',
            cancelRequest: 'Zrušit žádost',
            failure: 'Čekající změnu aktiva se nepodařilo zrušit.',
            retry: 'Zkusit znovu',
            terminal: 'Jde o konečný krok, který nelze vrátit zpět.',
        },
    },
] as const;

const TARGET_NAME = 'Customer account platform';
const APPROVAL_ID = 916;

function deferred() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    return { promise, release };
}

function json(route: Route, body: unknown, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function user() {
    const permissions = ['approvals:read', 'approvals:write', 'assets:read'];
    return {
        id: 161,
        email: 'issue161@example.test',
        name: 'Issue 161 Risk Manager',
        role: 'risk_manager',
        role_display_name: 'Risk Manager',
        department_id: 16,
        department_name: 'Technology',
        permissions,
        effective_permissions: permissions,
        access_scope: 'department',
        scope_label: 'Technology',
    };
}

function pendingAsset() {
    return {
        id: 161,
        name: TARGET_NAME,
        description: 'Representative recoverable-action browser fixture.',
        business_owner_user_id: 161,
        ict_owner_user_id: 162,
        owning_department_id: 16,
        business_owner: {
            name: 'Asset Owner',
            role_name: 'business_user',
            department_name: 'Technology',
        },
        ict_owner: {
            name: 'ICT Owner',
            role_name: 'ict_user',
            department_name: 'Technology',
        },
        owning_department: { name: 'Technology', code: 'TECH' },
        business_owner_orphaned: false,
        ict_owner_orphaned: false,
        ownership_status: 'assigned',
        is_archived: false,
        capabilities: {
            can_read: true,
            can_update: false,
            can_archive: false,
            can_restore: false,
            has_pending_change: true,
            business_edit_blocked: true,
            can_cancel_pending_change: true,
        },
        pending_change: {
            approval_id: APPROVAL_ID,
            proposal_id: '9b8f9490-d94a-4248-86e4-a9498d22c455',
            proposal_version: 1,
            status: 'pending',
            requested_at: '2026-09-01T10:00:00Z',
            requested_by_name: 'Asset Owner',
            reason: 'Review protected Asset edit',
            generic_label: 'protected_asset_change',
            mutation_kind: 'asset.edit',
            before: { name: TARGET_NAME },
            after: { name: `${TARGET_NAME} v2` },
            derived_impact: {
                before: { cif: 'no', resulting_criticality: 'medium' },
                after: { cif: 'no', resulting_criticality: 'high' },
            },
            impacted_resources: [{ resource_type: 'asset', resource_name: TARGET_NAME }],
            relationship_change: null,
            capabilities: { can_view_diff: true, can_cancel: true },
        },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-09-01T10:00:00Z',
    };
}

async function installMockApi(page: Page, locale: 'en' | 'cs', state: {
    cancellationRequests: number;
    releaseCancellation: (requestNumber: number) => void;
    waitForCancellationRelease: (requestNumber: number) => Promise<void>;
}) {
    await page.route('**/api/v1/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;

        if (pathname === '/api/v1/auth/config') {
            await json(route, {
                auth_mode: 'hybrid_dev',
                demo_login_enabled: true,
                password_login_enabled: true,
                strict_capabilities: false,
                demo_personas: [{
                    section: 'privileged',
                    name: 'Issue 161 Risk Manager',
                    email: 'issue161@example.test',
                    role_key: 'risk_manager',
                    dept_key: 'technology',
                    color: 'purple',
                }],
                sso: {
                    enabled: false,
                    provider: 'entra',
                    tenant_id: null,
                    client_id: null,
                    authority: null,
                    scopes: ['openid', 'profile', 'email'],
                },
                sso_error: null,
            });
            return;
        }
        if (pathname === '/api/v1/auth/demo-login' || pathname === '/api/v1/auth/refresh') {
            await json(route, {
                access_token: 'issue161-token',
                token_type: 'bearer',
                post_login_redirect_to: '/assets/161',
                user: user(),
            });
            return;
        }
        if (pathname === '/api/v1/auth/me') {
            await json(route, user());
            return;
        }
        if (pathname === '/api/v1/auth/csrf') {
            await route.fulfill({ status: 204 });
            return;
        }
        if (pathname === '/api/v1/preferences') {
            await json(route, { theme: 'riskhub', language: locale });
            return;
        }
        if (pathname === '/api/v1/users/me/shell-summary') {
            await json(route, {
                unread_notifications_count: 0,
                pending_approvals_count: 1,
                questionnaire_inbox_count: 0,
                orphan_total_count: 0,
                can_view_governance: false,
                generated_at: '2026-09-01T10:00:00Z',
            });
            return;
        }
        if (pathname === '/api/v1/assets/161' && request.method() === 'GET') {
            await json(route, pendingAsset());
            return;
        }
        if (
            pathname === '/api/v1/assets/161/process-links'
            || pathname === '/api/v1/assets/161/asset-links'
            || pathname === '/api/v1/assets/161/vendor-links'
        ) {
            await json(route, []);
            return;
        }
        if (pathname === '/api/v1/ict-register/reference/closed-lists') {
            await json(route, { lists: [] });
            return;
        }
        if (pathname === '/api/v1/ict-register/reference/ict-service-taxonomy') {
            await json(route, { services: [], cloud_service_codes: [] });
            return;
        }
        if (pathname === `/api/v1/approvals/${APPROVAL_ID}/cancel` && request.method() === 'POST') {
            state.cancellationRequests += 1;
            await state.waitForCancellationRelease(state.cancellationRequests);
            await json(route, { detail: 'deliberate cancellation failure' }, 500);
            return;
        }

        await json(route, { detail: `Issue 161 route not mocked: ${request.method()} ${pathname}` }, 404);
    });
}

async function assertDesktopState(page: Page, label: string) {
    const dialog = page.getByRole('alertdialog');
    await dialog.evaluate(async (element) => {
        const animations = element.getAnimations({ subtree: true }).filter((animation) => (
            animation.effect?.getComputedTiming().iterations !== Infinity
        ));
        await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    });
    const geometry = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.scrollWidth, `${label} horizontal overflow`).toBeLessThanOrEqual(geometry.clientWidth + 1);
    const analysis = await new AxeBuilder({ page })
        .withTags([...WCAG_TAGS])
        .include('[role="alertdialog"]')
        .analyze();
    assertZeroAxeFindings(toFindings(analysis.violations), label);
}

async function openJourney(browser: Browser, journey: typeof JOURNEYS[number]) {
    const cancellationGates = [deferred(), deferred()];
    const state = {
        cancellationRequests: 0,
        releaseCancellation: (requestNumber: number) => cancellationGates[requestNumber - 1]?.release(),
        waitForCancellationRelease: (requestNumber: number) => (
            cancellationGates[requestNumber - 1]?.promise ?? Promise.resolve()
        ),
    };
    const context = await browser.newContext({ viewport: journey.viewport, timezoneId: 'Europe/Prague' });
    await context.addInitScript((locale) => {
        localStorage.setItem('riskhub-language', locale);
        localStorage.setItem('riskhub-theme', 'riskhub');
    }, journey.locale);
    const page = await context.newPage();
    await installMockApi(page, journey.locale, state);
    await page.goto('/login');
    await page.getByRole('button', { name: 'Issue 161 Risk Manager' }).click();
    await expect(page).toHaveURL(/\/assets\/161$/);
    await expect(page.getByRole('heading', { name: TARGET_NAME })).toBeVisible();
    return { context, page, state };
}

test.describe('Issue #161 recoverable pending-change cancellation', () => {
    for (const journey of JOURNEYS) {
        test(`${journey.locale} keeps the exact target through dismiss, pending, and failure`, async ({ browser }) => {
            const { context, page, state } = await openJourney(browser, journey);
            try {
                const pendingPanel = page.getByTestId('asset-pending-change');
                const cancellationOpener = pendingPanel.getByRole('button', {
                    name: journey.labels.cancelRequest,
                    exact: true,
                });
                await cancellationOpener.click();

                let dialog = page.getByRole('alertdialog');
                const initialConfirm = dialog.getByRole('button', {
                    name: journey.labels.cancelRequest,
                    exact: true,
                });
                await expect(initialConfirm).toBeFocused();
                await expect(dialog).toContainText(TARGET_NAME);
                await expect(dialog).toContainText(journey.labels.terminal);
                await expect(dialog).not.toContainText(String(APPROVAL_ID));
                await assertDesktopState(page, `${journey.locale} cancellation confirmation`);

                await dialog.getByRole('button', { name: journey.labels.cancel, exact: true }).click();
                await expect(dialog).toHaveCount(0);
                await expect(cancellationOpener).toBeFocused();
                expect(state.cancellationRequests).toBe(0);

                await cancellationOpener.click();
                dialog = page.getByRole('alertdialog');
                await dialog.getByRole('button', { name: journey.labels.cancelRequest, exact: true }).click();
                await expect.poll(() => state.cancellationRequests).toBe(1);

                await expect(dialog).toContainText(TARGET_NAME);
                await expect(dialog.getByRole('button', { name: journey.labels.cancel, exact: true })).toBeDisabled();
                await assertDesktopState(page, `${journey.locale} cancellation pending`);

                state.releaseCancellation(1);
                await expect(dialog.getByRole('alert')).toHaveText(journey.labels.failure);
                await expect(dialog).toContainText(TARGET_NAME);
                const retry = dialog.getByRole('button', { name: journey.labels.retry, exact: true });
                await expect(retry).toBeEnabled();
                expect(state.cancellationRequests).toBe(1);
                await assertDesktopState(page, `${journey.locale} retained cancellation failure`);

                await retry.click();
                await expect.poll(() => state.cancellationRequests).toBe(2);
                await expect(dialog).toContainText(TARGET_NAME);
                await expect(dialog.getByRole('button', { name: journey.labels.cancel, exact: true })).toBeDisabled();
                await assertDesktopState(page, `${journey.locale} cancellation retry pending`);

                state.releaseCancellation(2);
                await expect(dialog.getByRole('alert')).toHaveText(journey.labels.failure);
                await expect(dialog).toContainText(TARGET_NAME);
                await expect(dialog.getByRole('button', { name: journey.labels.retry, exact: true })).toBeEnabled();
                expect(state.cancellationRequests).toBe(2);
            } finally {
                state.releaseCancellation(1);
                state.releaseCancellation(2);
                await context.close();
            }
        });
    }
});
