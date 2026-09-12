import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page, type Route } from '@playwright/test';

import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from './helpers/axeBaseline';

type Locale = 'en' | 'cs';

const JOURNEYS = [
    { locale: 'en' as const, viewport: { width: 1024, height: 768 } },
    { locale: 'cs' as const, viewport: { width: 1440, height: 900 } },
];

interface JourneyState {
    controlReads: number;
    markDirectoryAliceStarted: () => void;
    markRiskFiltersStarted: () => void;
    releaseControl: () => void;
    releaseDirectoryAlice: () => void;
    releaseRisk: () => void;
    releaseRiskFilters: () => void;
    waitForControl: Promise<void>;
    waitForDirectoryAlice: Promise<void>;
    waitForDirectoryAliceStarted: Promise<void>;
    waitForRisk: Promise<void>;
    waitForRiskFilters: Promise<void>;
    waitForRiskFiltersStarted: Promise<void>;
}

function deferred() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    return { promise, release };
}

function createState(): JourneyState {
    const risk = deferred();
    const control = deferred();
    const directoryAlice = deferred();
    const directoryAliceStarted = deferred();
    const riskFilters = deferred();
    const riskFiltersStarted = deferred();
    return {
        controlReads: 0,
        markDirectoryAliceStarted: directoryAliceStarted.release,
        markRiskFiltersStarted: riskFiltersStarted.release,
        releaseControl: control.release,
        releaseDirectoryAlice: directoryAlice.release,
        releaseRisk: risk.release,
        releaseRiskFilters: riskFilters.release,
        waitForControl: control.promise,
        waitForDirectoryAlice: directoryAlice.promise,
        waitForDirectoryAliceStarted: directoryAliceStarted.promise,
        waitForRisk: risk.promise,
        waitForRiskFilters: riskFilters.promise,
        waitForRiskFiltersStarted: riskFiltersStarted.promise,
    };
}

async function json(route: Route, body: unknown, status = 200) {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function user() {
    const permissions = ['risks:read', 'controls:read', 'users:read'];
    return {
        id: 163,
        email: 'issue163@example.test',
        name: 'Issue 163 Administrator',
        role: 'admin',
        role_display_name: 'Platform Administrator',
        department_id: null,
        department_name: null,
        permissions,
        effective_permissions: permissions,
        access_scope: 'global',
        scope_label: 'Global',
    };
}

function risk() {
    return {
        id: 163,
        risk_id_code: 'R-163',
        name: 'Request-owned Risk',
        process: 'Claims',
        subprocess: 'Settlement',
        risk_type: 'operational',
        category: 'Operational',
        description: 'A deterministic desktop fixture for truthful sidecar states.',
        department_id: null,
        owner_id: null,
        gross_probability: 4,
        gross_impact: 4,
        gross_score: 16,
        net_probability: 3,
        net_impact: 3,
        net_score: 9,
        status: 'active',
        is_archived: false,
        is_priority: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        kris: [],
        capabilities: {
            can_read: true,
            can_update: false,
            can_update_sensitive_fields: false,
            can_request_update_approval: false,
            can_archive_immediately: false,
            can_request_archive_approval: false,
            can_restore: false,
            can_send_questionnaire: false,
            can_create_kri: false,
            can_create_linked_control: false,
            can_link_controls: false,
            can_unlink_controls: true,
            can_view_linked_controls: true,
            can_view_linked_vendors: true,
            can_create_issue: false,
            has_pending_delete_approval: false,
            has_pending_update_approval: false,
            requires_privileged_update_approval: false,
            requires_privileged_delete_approval: false,
        },
    };
}

function controlLink() {
    return {
        id: 501,
        control_id: 501,
        risk_id: 163,
        effectiveness: 'high',
        notes: null,
        created_at: '2026-01-01T00:00:00Z',
        control: {
            id: 501,
            name: 'Settlement review',
            frequency: 'monthly',
            risk_level: 2,
            status: 'active',
            is_archived: false,
        },
    };
}

function directoryUser(externalId: string, displayName: string) {
    return {
        external_id: externalId,
        display_name: displayName,
        email: `${externalId}@example.test`,
        user_principal_name: `${externalId}@example.test`,
        department: 'Risk',
        job_title: 'Analyst',
        account_enabled: true,
        source: 'graph',
    };
}

function auditEntries() {
    return {
        entries: [
            {
                timestamp: '2026-09-01T08:00:00Z',
                level: 'INFO',
                event: 'user_update',
                logger_name: 'audit',
                request_id: 'request-163-a',
                user_id: null,
                client_ip: null,
                feature: 'users',
                extra: {},
            },
            {
                timestamp: '2026-09-01T09:00:00Z',
                level: 'INFO',
                event: 'risk_create',
                logger_name: 'audit',
                request_id: 'request-163-b',
                user_id: null,
                client_ip: null,
                feature: 'risks',
                extra: {},
            },
        ],
        total_lines: 2,
        file_path: 'audit.json.log',
    };
}

async function installMockApi(page: Page, locale: Locale, state: JourneyState) {
    await page.route('**/api/v1/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const { pathname, searchParams } = url;

        if (pathname === '/api/v1/auth/config') {
            await json(route, {
                auth_mode: 'hybrid_dev',
                demo_login_enabled: true,
                password_login_enabled: true,
                strict_capabilities: false,
                demo_personas: [{
                    section: 'privileged',
                    name: 'Issue 163 Administrator',
                    email: 'issue163@example.test',
                    role_key: 'admin',
                    dept_key: null,
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
                access_token: 'issue163-token',
                token_type: 'bearer',
                post_login_redirect_to: '/admin',
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
                pending_approvals_count: 0,
                questionnaire_inbox_count: 0,
                orphan_total_count: 0,
                can_view_governance: false,
                generated_at: '2026-09-01T00:00:00Z',
            });
            return;
        }
        if (pathname === '/api/v1/risks/163' && request.method() === 'GET') {
            await state.waitForRisk;
            await json(route, risk());
            return;
        }
        if (pathname === '/api/v1/risks' && request.method() === 'GET') {
            await json(route, {
                items: [],
                total: 0,
                offset: 0,
                limit: Number(searchParams.get('limit') ?? 1),
                groups: [],
                capabilities: {
                    can_create: true,
                    can_export: true,
                    can_view_vendor_contexts: true,
                },
                facets: {},
            });
            return;
        }
        if (pathname === '/api/v1/risks/163/controls' && request.method() === 'GET') {
            state.controlReads += 1;
            if (state.controlReads === 1) {
                await state.waitForControl;
                await json(route, [controlLink()]);
            } else if (state.controlReads === 2) {
                await json(route, { detail: 'deliberate stale refresh' }, 500);
            } else {
                await json(route, { detail: 'deliberate denial' }, 403);
            }
            return;
        }
        if (pathname === '/api/v1/risks/163/controls/501' && request.method() === 'DELETE') {
            await route.fulfill({ status: 204 });
            return;
        }
        if (pathname === '/api/v1/risks/163/vendors') {
            await json(route, []);
            return;
        }
        if (pathname === '/api/v1/kris/overdue') {
            await json(route, { detail: 'deliberate sidecar failure' }, 500);
            return;
        }
        if (pathname === '/api/v1/users/lookup/risk-owners' || pathname === '/api/v1/departments') {
            await json(route, []);
            return;
        }
        if (pathname === '/api/v1/lookups/risk-filters') {
            state.markRiskFiltersStarted();
            await state.waitForRiskFilters;
            await json(route, { detail: 'deliberate Risk suggestion failure' }, 500);
            return;
        }
        if (pathname === '/api/v1/users/directory') {
            await json(route, {
                items: [],
                available_roles: [],
                total: 0,
                skip: 0,
                limit: 1,
                capabilities: {
                    can_read_directory: true,
                    can_view_access_details: true,
                    can_use_role_facets: true,
                    can_create_local_user: false,
                    can_import_directory_user: true,
                },
            });
            return;
        }
        if (pathname === '/api/v1/directory/users/search') {
            const query = searchParams.get('q');
            if (query === 'alice') {
                state.markDirectoryAliceStarted();
                await state.waitForDirectoryAlice;
                await json(route, [directoryUser('alice', 'Alice Example')]);
                return;
            }
            if (query === 'bob') {
                await json(route, [directoryUser('bob', 'Bob Example')]);
                return;
            }
            await json(route, { detail: 'deliberate Directory lookup failure' }, 500);
            return;
        }
        if (
            pathname === '/api/v1/risks/163/threat-links'
            || pathname === '/api/v1/risks/163/process-links'
            || pathname === '/api/v1/risks/163/asset-links'
        ) {
            await json(route, []);
            return;
        }
        if (pathname === '/api/v1/riskhub/public-risk-types') {
            await json(route, []);
            return;
        }
        if (pathname.startsWith('/api/v1/riskhub/public-config/')) {
            await json(route, { value: pathname.includes('critical') ? 16 : pathname.includes('high') ? 10 : 5 });
            return;
        }
        if (pathname === '/api/v1/admin/capabilities') {
            await json(route, {
                can_revoke_sessions: true,
                can_run_directory_check_all: true,
                can_update_log_config: true,
                can_export_loaded_audit_logs: true,
            });
            return;
        }
        if (pathname === '/api/v1/admin/logs/config') {
            await json(route, {
                app_log_rotation_size_mb: 25,
                app_log_retention_count: 5,
                audit_log_rotation_size_mb: 50,
                audit_log_retention_count: 10,
            });
            return;
        }
        if (pathname === '/api/v1/admin/logs/audit') {
            const payload = auditEntries();
            await json(route, searchParams.get('event_type')
                ? { ...payload, entries: [], total_lines: 0 }
                : payload);
            return;
        }
        if (pathname === '/api/v1/admin/health') {
            await json(route, {
                database_status: 'healthy',
                database_latency_ms: 1,
                uptime_seconds: 3600,
                memory_usage_mb: 100,
                last_check: '2026-09-01T00:00:00Z',
            });
            return;
        }
        if (pathname === '/api/v1/admin/stats') {
            await json(route, {
                total_users: 1,
                active_users_24h: 1,
                total_risks: 1,
                total_controls: 1,
                total_kris: 0,
                pending_approvals: 0,
            });
            return;
        }
        if (pathname === '/api/v1/admin/jobs/status') {
            await json(route, {
                process_role: 'web',
                instance_id: 'issue163',
                process_started_at: '2026-09-01T00:00:00Z',
                scheduler_enabled: false,
                scheduler_running: false,
                lock_provider: null,
                lock_acquired: false,
                current_owner_instance_id: null,
                latest_runs: [],
                running_jobs: [],
            });
            return;
        }
        if (pathname === '/api/v1/admin/outbox/status') {
            await json(route, {
                pending_count: 0,
                processing_count: 0,
                dead_letter_count: 0,
                oldest_pending_age_seconds: null,
                last_dispatch_started_at: null,
                last_dispatch_finished_at: null,
                last_dispatch_status: null,
                last_dispatch_processed: null,
                last_dispatch_error: null,
                recent_failures: [],
            });
            return;
        }

        await json(route, { detail: `Issue 163 route not mocked: ${request.method()} ${pathname}` }, 404);
    });
}

async function assertDesktopState(page: Page, label: string, scope = 'main') {
    await page.locator(scope).evaluate(async (element) => {
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
    const analysis = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).include(scope).analyze();
    assertZeroAxeFindings(toFindings(analysis.violations), label);
}

async function navigateSpa(page: Page, target: string) {
    await page.evaluate((path) => {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
    }, target);
}

async function openJourney(browser: Browser, journey: typeof JOURNEYS[number]) {
    const context = await browser.newContext({ viewport: journey.viewport, timezoneId: 'Europe/Prague' });
    await context.addInitScript((locale) => {
        localStorage.setItem('riskhub-language', locale);
        localStorage.setItem('riskhub-theme', 'riskhub');
    }, journey.locale);
    const page = await context.newPage();
    const state = createState();
    await installMockApi(page, journey.locale, state);
    await page.goto('/login');
    await page.getByRole('button', { name: /Issue 163 Administrator/ }).click();
    await expect(page).toHaveURL(/\/admin/);
    return { context, page, state };
}

test.describe('Issue #163 request-owned desktop states', () => {
    for (const journey of JOURNEYS) {
        test(`${journey.locale} loading, content, empty, error, stale, denied, and filter-empty states`, async ({ browser }) => {
            const { context, page, state } = await openJourney(browser, journey);
            try {
                await navigateSpa(page, '/risks/163');
                const loading = page.locator('[data-loading="true"]');
                await expect(
                    loading,
                    `Risk loading surface missing. Body: ${await page.locator('body').innerText()}`,
                ).toBeVisible();
                await assertDesktopState(page, `${journey.locale} Risk core loading`);

                state.releaseRisk();
                await expect(page.getByRole('heading', { name: 'Request-owned Risk' })).toBeVisible();
                await expect(page.getByText(/No vendors linked|nejsou propojeni žádní dodavatelé/i)).toBeVisible();
                await expect(page.getByTestId('risk-overdue-kris-load-state')).toBeVisible();
                await expect(page.getByText('Settlement review')).toHaveCount(0);

                state.releaseControl();
                await page.locator('main').evaluate(async (element) => {
                    await Promise.all(element.getAnimations({ subtree: true }).map(
                        (animation) => animation.finished.catch(() => undefined),
                    ));
                });
                const controlCard = page.getByRole('button', { name: /Settlement review/ });
                await expect(controlCard).toBeVisible();
                await assertDesktopState(page, `${journey.locale} Risk content, empty, and sidecar error`);

                await page.getByRole('button', { name: /Manage Existing Links|Spravovat existující propojení/i }).click();
                const linkDialog = page.getByTestId('link-management-dialog');
                await linkDialog.getByRole('button', { name: /Unlink Settlement review|Odpojit Settlement review/i }).click();
                await page.getByRole('alertdialog').getByRole('button', { name: /Delete|Smazat/i }).click();
                await expect.poll(() => state.controlReads).toBe(2);
                await linkDialog.getByRole('button', { name: /Close|Zavřít/i }).last().click();

                const stale = page.getByTestId('risk-linked-controls-load-state');
                await expect(stale).toBeVisible();
                await expect(controlCard).toBeVisible();
                await assertDesktopState(page, `${journey.locale} retained stale sidecar`, '[data-testid="risk-linked-controls-load-state"]');

                await stale.getByRole('button', { name: /Retry|Zkusit znovu/i }).click();
                await expect.poll(() => state.controlReads).toBe(3);
                const denied = page.getByTestId('risk-linked-controls-load-state');
                await expect(denied).toBeVisible();
                await expect(denied.getByRole('button', { name: /Retry|Zkusit znovu/i })).toHaveCount(0);
                await expect(controlCard).toHaveCount(0);
                await assertDesktopState(page, `${journey.locale} denied sidecar`, '[data-testid="risk-linked-controls-load-state"]');

                await navigateSpa(page, '/admin?tab=audit');
                await expect(page.getByRole('heading', { name: /Audit Event Feed|Auditní události/i })).toBeVisible();
                const eventFilter = page.getByRole('combobox', { name: /All Events|Všechny události/i });
                await eventFilter.click();
                await page.getByRole('option', { name: /user update/i }).click();
                await expect(page.locator('tbody').getByText(/user update/i)).toHaveCount(0);
                await eventFilter.click();
                await expect(page.getByRole('option', { name: /risk create/i })).toBeVisible();
                await page.keyboard.press('Escape');
                await assertDesktopState(page, `${journey.locale} empty filtered Audit rows with stable vocabulary`);

                await navigateSpa(page, '/risks/new');
                await state.waitForRiskFiltersStarted;
                const processInput = page.getByRole('combobox', { name: /Main Process|Hlavní proces/i });
                await expect(processInput).toBeVisible();
                await processInput.fill('Novel workflow');
                await expect(processInput).toHaveValue('Novel workflow');
                await expect(page.getByText(/Create "Novel workflow"|Vytvořit "Novel workflow"/i)).toBeVisible();
                await assertDesktopState(page, `${journey.locale} Risk lookup loading with free entry`);

                const failedRiskFilters = page.waitForResponse((response) => (
                    new URL(response.url()).pathname === '/api/v1/lookups/risk-filters'
                    && response.status() === 500
                ));
                state.releaseRiskFilters();
                await failedRiskFilters;
                await expect(processInput).toHaveValue('Novel workflow');
                await expect(page.getByText(/Create "Novel workflow"|Vytvořit "Novel workflow"/i)).toBeVisible();
                await assertDesktopState(page, `${journey.locale} Risk lookup error keeps free entry`);

                await navigateSpa(page, '/users/new');
                const directorySearch = page.getByRole('textbox', {
                    name: /Search by name or email|Hledat podle jména nebo e-mailu/i,
                });
                await expect(directorySearch).toBeVisible();
                await directorySearch.fill('alice');
                await state.waitForDirectoryAliceStarted;
                await expect(page.getByText(/Searching directory|Vyhledávám v adresáři/i)).toBeVisible();
                await assertDesktopState(page, `${journey.locale} Directory Alice loading`);

                state.releaseDirectoryAlice();
                await expect(page.getByText('Alice Example')).toBeVisible();
                await assertDesktopState(page, `${journey.locale} Directory Alice result`);

                await directorySearch.fill('bob');
                await expect(page.getByText('Alice Example')).toHaveCount(0);
                await expect(page.getByText('Bob Example')).toBeVisible();
                await assertDesktopState(page, `${journey.locale} Directory Bob replaces Alice`);

                await directorySearch.fill('');
                await expect(page.getByText(/Type to search your directory|Pro vyhledání v adresáři začněte psát/i)).toBeVisible();
                await expect(page.getByText('Bob Example')).toHaveCount(0);
                await assertDesktopState(page, `${journey.locale} Directory cleared`);

                await directorySearch.fill('error');
                await expect(page.getByRole('alert')).toContainText(
                    /Directory search failed.*Try again|Vyhledávání v adresáři selhalo.*Zkuste to znovu/i,
                );
                await assertDesktopState(page, `${journey.locale} Directory error`);
            } finally {
                await context.close();
            }
        });
    }
});
