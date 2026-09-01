import AxeBuilder from '@axe-core/playwright';
import {
    expect,
    test,
    type Browser,
    type Page,
    type Route,
    type TestInfo,
} from '@playwright/test';

import {
    assertZeroAxeFindings,
    toFindings,
    WCAG_TAGS,
} from './helpers/axeBaseline';

type JourneyLocale = 'en' | 'cs';
type Principal = 'cro' | 'department-head';

interface JourneyConfig {
    label: string;
    locale: JourneyLocale;
    viewport: { width: number; height: number };
    copy: {
        notifications: string;
        revert: string;
        retry: string;
        settings: string;
        totalControls: string;
        unsynced: string;
    };
}

interface JourneyState {
    activeToken: string | null;
    currentPrincipal: Principal | null;
    departmentOverviewRequests: number;
    forceNotificationRefresh: boolean;
    localeModuleRequests: JourneyLocale[];
    notificationRequests: number;
    overviewRequests: number;
    preferencePutAttempts: number;
    protectedAuthorizations: Record<Principal | 'refreshed-department-head', string[]>;
    refreshRequests: number;
    releaseDepartmentOverview: () => void;
    waitForDepartmentOverview: Promise<void>;
}

const CRO_EMAIL = 'cro.ux162@example.test';
const DEPARTMENT_HEAD_EMAIL = 'department-head.ux162@example.test';
const CRO_TOKEN = 'ux162-cro-token';
const DEPARTMENT_HEAD_TOKEN = 'ux162-department-head-token';
const REFRESHED_DEPARTMENT_HEAD_TOKEN = 'ux162-department-head-refreshed-token';

const JOURNEYS: JourneyConfig[] = [
    {
        label: '1024x768 English',
        locale: 'en',
        viewport: { width: 1024, height: 768 },
        copy: {
            notifications: 'Notifications',
            revert: 'Revert',
            retry: 'Retry',
            settings: 'Settings',
            totalControls: 'Total Controls',
            unsynced: 'Unsynced',
        },
    },
    {
        label: '1440x900 Czech',
        locale: 'cs',
        viewport: { width: 1440, height: 900 },
        copy: {
            notifications: 'Oznámení',
            revert: 'Vrátit změnu',
            retry: 'Zkusit znovu',
            settings: 'Nastavení',
            totalControls: 'Celkem kontrol',
            unsynced: 'Nesynchronizováno',
        },
    },
];

function buildUser(principal: Principal) {
    const isCro = principal === 'cro';
    const permissions = [
        'controls:read',
        'dashboard:read',
        'departments:read',
        'risks:read',
        'vendors:read',
        ...(isCro ? ['users:write'] : []),
    ];

    return {
        id: isCro ? 16201 : 16202,
        email: isCro ? CRO_EMAIL : DEPARTMENT_HEAD_EMAIL,
        name: isCro ? 'UX162 CRO' : 'UX162 Department Head',
        role: isCro ? 'cro' : 'department_head',
        role_display_name: isCro ? 'Chief Risk Officer' : 'Department Head',
        department_id: isCro ? null : 7,
        department_name: isCro ? null : 'Operations',
        permissions,
        effective_permissions: permissions,
        access_scope: isCro ? 'global' : 'department',
        scope_label: isCro ? 'Global' : 'Operations',
    };
}

function authResponse(principal: Principal, token: string) {
    return {
        access_token: token,
        token_type: 'bearer',
        post_login_redirect_to: '/',
        user: buildUser(principal),
    };
}

function overview(totalControls: number) {
    return {
        summary: {
            total_controls: totalControls,
            controls_by_status: {},
            controls_by_form: {},
            controls_by_frequency: {},
            total_risks: 0,
            risks_by_status: {},
            critical_risks_count: 0,
            average_net_risk_score: 0,
            risk_thresholds: { critical: 16, high: 10, medium: 5 },
            total_vendors: 0,
            high_risk_vendors_count: 0,
        },
        department_metrics: [],
        gross_distribution: { distribution: [] },
        net_distribution: { distribution: [] },
        control_trends: [],
        risk_trends: [],
        kri_breach_trends: [],
        issue_summary: null,
        issue_aging: null,
        issue_severity: null,
        filter_scope: {
            department_applies_to_all_scoped_panels: true,
            risk_level_applies_to: [
                'risk_summary',
                'risk_distribution',
                'risk_trends',
                'department_risk_metrics',
            ],
            control_filters_apply_to: [
                'control_summary',
                'control_trends',
                'department_control_metrics',
            ],
            unaffected_by_risk_control: ['kri', 'issues', 'vendors'],
        },
        generated_at: '2026-08-31T12:00:00Z',
        capabilities: {
            can_read: true,
            can_view_issue_metrics: false,
            can_view_committee: false,
            can_view_vendor_metrics: false,
            can_use_department_filter: false,
            can_export_or_report: false,
        },
    };
}

function authorization(route: Route): string {
    return route.request().headers().authorization ?? '<none>';
}

async function json(route: Route, body: unknown, status = 200) {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function createJourneyState(): JourneyState {
    let releaseDepartmentOverview!: () => void;
    const waitForDepartmentOverview = new Promise<void>((resolve) => {
        releaseDepartmentOverview = resolve;
    });

    return {
        activeToken: null,
        currentPrincipal: null,
        departmentOverviewRequests: 0,
        forceNotificationRefresh: false,
        localeModuleRequests: [],
        notificationRequests: 0,
        overviewRequests: 0,
        preferencePutAttempts: 0,
        protectedAuthorizations: {
            cro: [],
            'department-head': [],
            'refreshed-department-head': [],
        },
        refreshRequests: 0,
        releaseDepartmentOverview,
        waitForDepartmentOverview,
    };
}

async function installRouteIntercepts(page: Page, config: JourneyConfig, state: JourneyState) {
    await page.route('**/api/v1/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (!url.pathname.startsWith('/api/v1/auth/')) {
            const actualAuthorization = authorization(route);
            const expectedAuthorization = state.activeToken ? `Bearer ${state.activeToken}` : null;
            if (!state.currentPrincipal || !expectedAuthorization || actualAuthorization !== expectedAuthorization) {
                throw new Error(
                    `UX162 rejected ${request.method()} ${url.pathname}: expected ${expectedAuthorization ?? 'an authenticated principal'}, received ${actualAuthorization}`,
                );
            }
            const authorizationLane = state.activeToken === REFRESHED_DEPARTMENT_HEAD_TOKEN
                ? 'refreshed-department-head'
                : state.currentPrincipal;
            state.protectedAuthorizations[authorizationLane].push(actualAuthorization);
        }

        if (url.pathname === '/api/v1/auth/config') {
            await json(route, {
                auth_mode: 'hybrid_dev',
                demo_login_enabled: true,
                password_login_enabled: true,
                strict_capabilities: false,
                demo_personas: [
                    {
                        section: 'privileged',
                        name: 'UX162 CRO',
                        email: CRO_EMAIL,
                        role_key: 'cro',
                        dept_key: null,
                        color: 'purple',
                    },
                    {
                        section: 'department_heads',
                        name: 'UX162 Department Head',
                        email: DEPARTMENT_HEAD_EMAIL,
                        role_key: 'department_head',
                        dept_key: 'operations',
                        color: 'emerald',
                    },
                ],
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

        if (url.pathname === '/api/v1/auth/demo-login') {
            const email = (request.postDataJSON() as { email: string }).email;
            if (email !== CRO_EMAIL && email !== DEPARTMENT_HEAD_EMAIL) {
                throw new Error(`UX162 rejected unexpected demo principal: ${email}`);
            }
            const principal: Principal = email === CRO_EMAIL ? 'cro' : 'department-head';
            state.currentPrincipal = principal;
            state.activeToken = principal === 'cro' ? CRO_TOKEN : DEPARTMENT_HEAD_TOKEN;
            await json(
                route,
                authResponse(
                    principal,
                    state.activeToken,
                ),
            );
            return;
        }

        if (url.pathname === '/api/v1/auth/csrf') {
            await route.fulfill({
                status: 204,
                headers: {
                    'set-cookie': 'riskhub_csrf_token=ux162-csrf; Path=/; SameSite=Lax',
                },
            });
            return;
        }

        if (url.pathname === '/api/v1/auth/logout') {
            if (state.currentPrincipal !== 'cro' || authorization(route) !== `Bearer ${CRO_TOKEN}`) {
                throw new Error(`UX162 rejected CRO logout credential: ${authorization(route)}`);
            }
            state.currentPrincipal = null;
            state.activeToken = null;
            await json(route, { message: 'Logged out' });
            return;
        }

        if (url.pathname === '/api/v1/auth/refresh') {
            if (state.currentPrincipal !== 'department-head' || state.activeToken !== DEPARTMENT_HEAD_TOKEN) {
                throw new Error('UX162 refresh did not originate from the Department Head session');
            }
            if (authorization(route) !== '<none>') {
                throw new Error(`UX162 refresh unexpectedly sent an access token: ${authorization(route)}`);
            }
            state.refreshRequests += 1;
            state.activeToken = REFRESHED_DEPARTMENT_HEAD_TOKEN;
            await json(
                route,
                authResponse('department-head', REFRESHED_DEPARTMENT_HEAD_TOKEN),
            );
            return;
        }

        if (url.pathname === '/api/v1/dashboard/overview') {
            state.overviewRequests += 1;
            if (state.currentPrincipal === 'cro') {
                await json(route, overview(91));
                return;
            }

            state.departmentOverviewRequests += 1;
            await state.waitForDepartmentOverview;
            await json(route, overview(7));
            return;
        }

        if (url.pathname === '/api/v1/preferences') {
            if (request.method() === 'PUT') {
                state.preferencePutAttempts += 1;
                await json(route, { detail: 'preference write deliberately failed' }, 503);
                return;
            }
            await json(route, { theme: 'riskhub', language: config.locale });
            return;
        }

        if (url.pathname === '/api/v1/notifications') {
            state.notificationRequests += 1;
            if (state.forceNotificationRefresh && state.notificationRequests === 1) {
                await json(route, { detail: 'expired session' }, 401);
                return;
            }
            await json(route, {
                items: [],
                total: 0,
                skip: 0,
                limit: 10,
                unread_count: 0,
            });
            return;
        }

        if (url.pathname === '/api/v1/users/me/shell-summary') {
            await json(route, {
                unread_notifications_count: 0,
                pending_approvals_count: 0,
                questionnaire_inbox_count: 0,
                orphan_total_count: 0,
                can_view_governance: false,
                generated_at: '2026-08-31T12:00:00Z',
            });
            return;
        }

        if (url.pathname === '/api/v1/departments') {
            await json(route, []);
            return;
        }

        await json(route, { detail: `UX162 route not mocked: ${request.method()} ${url.pathname}` }, 404);
    });
}

function dashboardSentinel(page: Page, label: string, value: number) {
    return page.getByRole('button').filter({ hasText: label }).filter({ hasText: String(value) });
}

async function openJourney(browser: Browser, config: JourneyConfig) {
    const context = await browser.newContext({ viewport: config.viewport });
    await context.addInitScript(({ locale }) => {
        localStorage.setItem('riskhub-language', locale);
        localStorage.setItem('riskhub-theme', 'riskhub');
    }, { locale: config.locale });
    const page = await context.newPage();
    const state = createJourneyState();
    page.on('request', (request) => {
        const match = new URL(request.url()).pathname.match(/\/src\/i18n\/locales\/(en|cs)\//);
        const locale = match?.[1] as JourneyLocale | undefined;
        if (locale && !state.localeModuleRequests.includes(locale)) {
            state.localeModuleRequests.push(locale);
        }
    });
    await installRouteIntercepts(page, config, state);
    return { context, page, state };
}

async function runPrincipalJourney(
    browser: Browser,
    config: JourneyConfig,
    testInfo: TestInfo,
): Promise<void> {
    const { context, page, state } = await openJourney(browser, config);

    try {
        await page.goto('/login');
        await expect.poll(() => state.localeModuleRequests).toContain(config.locale);
        expect(state.localeModuleRequests).not.toContain(config.locale === 'en' ? 'cs' : 'en');
        await page.getByRole('button', { name: /UX162 CRO/ }).click();
        await expect(page).toHaveURL(/\/$/);
        await expect(dashboardSentinel(page, config.copy.totalControls, 91)).toBeVisible();
        await expect(page.getByRole('link', { name: 'Risk Hub', exact: true })).toBeVisible();
        const croOverviewRequests = state.overviewRequests;
        expect(croOverviewRequests).toBeGreaterThan(0);
        expect(state.protectedAuthorizations.cro.length).toBeGreaterThan(0);
        expect(new Set(state.protectedAuthorizations.cro)).toEqual(new Set([`Bearer ${CRO_TOKEN}`]));

        await page.getByTestId('logout-button').click();
        await expect(page).toHaveURL(/\/login/);
        await expect(dashboardSentinel(page, config.copy.totalControls, 91)).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Risk Hub', exact: true })).toHaveCount(0);

        await page.getByRole('button', { name: /UX162 Department Head/ }).click();
        await expect(page).toHaveURL(/\/$/);
        await expect.poll(() => state.departmentOverviewRequests).toBeGreaterThan(0);

        await expect(dashboardSentinel(page, config.copy.totalControls, 91)).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Risk Hub', exact: true })).toHaveCount(0);
        await expect(page.getByText('Chief Risk Officer', { exact: true })).toHaveCount(0);
        expect(state.overviewRequests).toBeGreaterThan(croOverviewRequests);
        expect(state.protectedAuthorizations['department-head'].length).toBeGreaterThan(0);
        expect(new Set(state.protectedAuthorizations['department-head']))
            .toEqual(new Set([`Bearer ${DEPARTMENT_HEAD_TOKEN}`]));

        state.releaseDepartmentOverview();
        await expect(dashboardSentinel(page, config.copy.totalControls, 7)).toBeVisible();

        const overviewRequestsBeforeRefresh = state.overviewRequests;
        state.forceNotificationRefresh = true;
        await page.getByRole('button', { name: config.copy.notifications }).click();
        await expect.poll(() => state.refreshRequests).toBe(1);
        await expect.poll(() => state.notificationRequests).toBe(2);
        expect(state.protectedAuthorizations['refreshed-department-head'].length).toBeGreaterThan(0);
        expect(new Set(state.protectedAuthorizations['refreshed-department-head']))
            .toEqual(new Set([`Bearer ${REFRESHED_DEPARTMENT_HEAD_TOKEN}`]));
        await expect(dashboardSentinel(page, config.copy.totalControls, 7)).toBeVisible();
        expect(state.overviewRequests).toBe(overviewRequestsBeforeRefresh);

        await page.getByRole('button', { name: config.copy.notifications }).click();
        const settingsLink = page.locator('aside a[href="/settings"]');
        await expect(settingsLink).toHaveAccessibleName(config.copy.settings);
        await settingsLink.focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/settings$/);
        await page.getByTestId('settings-tab-appearance').click();
        await page.getByTestId('theme-dark').click();

        await expect.poll(() => state.preferencePutAttempts).toBe(1);
        const unsynced = page.locator('[role="status"]').filter({ hasText: config.copy.unsynced });
        await expect(unsynced).toBeVisible();
        await expect(unsynced.getByRole('button', { name: config.copy.retry, exact: true })).toBeVisible();
        await expect(unsynced.getByRole('button', { name: config.copy.revert, exact: true })).toBeVisible();

        const appearanceTab = page.getByTestId('settings-tab-appearance');
        await expect(appearanceTab).toHaveAttribute('aria-selected', 'true');
        await appearanceTab.evaluate(async (element) => {
            const finiteAnimations = element.getAnimations({ subtree: true }).filter((animation) => (
                animation.effect?.getComputedTiming().iterations !== Infinity
            ));
            await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => undefined)));
        });

        const axe = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
        const findings = toFindings(axe.violations);
        await testInfo.attach(`ux162-unsynced-axe-${config.label}`, {
            body: JSON.stringify(findings, null, 2),
            contentType: 'application/json',
        });
        assertZeroAxeFindings(findings, `${config.label} changed Unsynced preference state`);
    } finally {
        state.releaseDepartmentOverview();
        await context.close();
    }
}

test.describe('Issue #162 principal-owned session and preference acceptance', () => {
    for (const journey of JOURNEYS) {
        test(`${journey.label} isolates principals, preserves same-user cache, and exposes an accessible Unsynced state`, async ({
            browser,
        }, testInfo) => {
            test.setTimeout(120_000);
            await runPrincipalJourney(browser, journey, testInfo);
        });
    }
});
