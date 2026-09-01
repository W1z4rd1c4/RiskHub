import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page, type Route } from '@playwright/test';

import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from './helpers/axeBaseline';

type Locale = 'en' | 'cs';

const JOURNEYS = [
    {
        locale: 'en' as const,
        viewport: { width: 1024, height: 768 },
        labels: {
            average: 'Avg Risk Score',
            critical: 'Critical',
            committee: 'Risk Committee',
            departmentExposure: 'Sum of net Risk scores',
            generatedTime: 'Sep 1, 2026, 05:45 PM',
            issueEvaluation: 'Current register evaluated on a date',
            issueEvaluationDate: 'Evaluation date',
            newFromZero: 'New (from 0) +3',
            questionnaires: 'Assessment questionnaires',
            riskCount: '3 Risks',
            riskScores: 'Gross and net Risk scores',
            stockCompare: '2026-Q2 · Stored 2026-07-01T00:00:00+00:00',
            stockCurrent: '2026-Q3 · Live 2026-08-15T12:00:00+00:00',
            stockEvidence: 'Stock observations',
            updated: 'Updated',
        },
    },
    {
        locale: 'cs' as const,
        viewport: { width: 1440, height: 900 },
        labels: {
            average: 'Průměrné skóre',
            critical: 'Kritické',
            committee: 'Výbor pro řízení rizik',
            departmentExposure: 'Součet čistých skóre rizik',
            generatedTime: '1. 9. 2026 17:45',
            issueEvaluation: 'Aktuální registr vyhodnocený k datu',
            issueEvaluationDate: 'Datum vyhodnocení',
            newFromZero: 'Nové (z 0) +3',
            questionnaires: 'Hodnoticí dotazníky',
            riskCount: '3 rizika',
            riskScores: 'Hrubé a čisté skóre rizika',
            stockCompare: '2026-Q2 · Uložená data 2026-07-01T00:00:00+00:00',
            stockCurrent: '2026-Q3 · Živá data 2026-08-15T12:00:00+00:00',
            stockEvidence: 'Stavová pozorování',
            updated: 'Aktualizováno',
        },
    },
] as const;

function json(route: Route, body: unknown, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function user() {
    const permissions = [
        'controls:read',
        'dashboard:read',
        'departments:read',
        'issues:read',
        'reports:read',
        'risks:read',
        'vendors:read',
    ];
    return {
        id: 165,
        email: 'issue165@example.test',
        name: 'Issue 165 CRO',
        role: 'cro',
        role_display_name: 'Chief Risk Officer',
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
        id: 165,
        risk_id_code: 'R-165',
        name: 'Issue 165 evidence Risk',
        process: 'Evidence review',
        risk_type: 'operational',
        category: 'Operational',
        description: 'Desktop evidence fixture.',
        department_id: null,
        owner_id: null,
        gross_probability: 4,
        gross_impact: 5,
        gross_score: 20,
        net_probability: 3,
        net_impact: 4,
        net_score: 12,
        status: 'active',
        is_archived: false,
        is_priority: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-08-15T12:00:00Z',
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
            can_unlink_controls: false,
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

function overview() {
    return {
        summary: {
            total_controls: 8,
            controls_by_status: {},
            controls_by_form: {},
            controls_by_frequency: {},
            total_risks: 3,
            risks_by_status: {},
            critical_risks_count: 1,
            average_net_risk_score: 17,
            risk_thresholds: { critical: 16, high: 10, medium: 5 },
            total_vendors: 2,
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
        generated_at: '2026-09-01T15:45:00Z',
        capabilities: {
            can_read: true,
            can_view_issue_metrics: false,
            can_view_committee: true,
            can_view_vendor_metrics: true,
            can_use_department_filter: true,
            can_export_or_report: true,
        },
        filter_scope: {
            department_applies_to_all_scoped_panels: true,
            risk_level_applies_to: ['summary', 'risk_distribution'],
            control_filters_apply_to: ['summary'],
            unaffected_by_risk_control: ['kri', 'issues', 'vendors'],
        },
    };
}

function quarterlyComparison() {
    return {
        this_quarter: { new_risks: 3, priority_risks: 2 },
        last_quarter: { new_risks: 0, priority_risks: 1 },
        changes: {
            new_risks: {
                absolute: 3,
                percentage: null,
                direction: 'unknown',
                reason: 'baseline_zero',
            },
            priority_risks: {
                absolute: null,
                percentage: null,
                direction: 'unknown',
                reason: 'incomparable_source',
            },
        },
        period: {
            this_start: '2026-07-01T00:00:00+00:00',
            this_end: '2026-08-15T12:00:00+00:00',
            last_start: '2026-04-01T00:00:00+00:00',
            last_end: '2026-05-16T12:00:00+00:00',
            window_type: 'equal_elapsed',
        },
        metric_observations: {
            new_risks: {
                metric_type: 'flow',
                current: {
                    source: 'live',
                    start: '2026-07-01T00:00:00+00:00',
                    end: '2026-08-15T12:00:00+00:00',
                },
                compare: {
                    source: 'live',
                    start: '2026-04-01T00:00:00+00:00',
                    end: '2026-05-16T12:00:00+00:00',
                },
            },
            priority_risks: {
                metric_type: 'stock',
                current: { source: 'live', observed_at: '2026-08-15T12:00:00+00:00' },
                compare: { source: 'stored', observed_at: '2026-07-01T00:00:00+00:00' },
            },
        },
        snapshot_info: {
            current_quarter: '2026-Q3',
            last_quarter: '2026-Q2',
            last_quarter_snapshot_available: true,
            current_quarter_snapshot_available: true,
            missing_snapshot_quarters: [],
            snapshot_sources: { current: 'live', compare: 'stored' },
            missing_snapshot_metrics: { current: [], compare: [] },
            period_metrics: ['new_risks'],
            snapshot_metrics: ['priority_risks'],
        },
    };
}

async function installMockApi(page: Page, locale: Locale) {
    await page.route('**/api/v1/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (url.pathname === '/api/v1/auth/config') {
            await json(route, {
                auth_mode: 'hybrid_dev',
                demo_login_enabled: true,
                password_login_enabled: true,
                strict_capabilities: false,
                demo_personas: [{
                    section: 'privileged',
                    name: 'Issue 165 CRO',
                    email: 'issue165@example.test',
                    role_key: 'cro',
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
        if (url.pathname === '/api/v1/auth/demo-login' || url.pathname === '/api/v1/auth/refresh') {
            await json(route, {
                access_token: 'issue165-browser-token',
                token_type: 'bearer',
                post_login_redirect_to: '/',
                user: user(),
            });
            return;
        }
        if (url.pathname === '/api/v1/auth/me') {
            await json(route, user());
            return;
        }
        if (url.pathname === '/api/v1/preferences') {
            await json(route, { theme: 'riskhub', language: locale });
            return;
        }
        if (url.pathname === '/api/v1/users/me/shell-summary') {
            await json(route, {
                unread_notifications_count: 0,
                pending_approvals_count: 0,
                questionnaire_inbox_count: 0,
                orphan_total_count: 0,
                can_view_governance: false,
                generated_at: '2026-09-01T15:45:00Z',
            });
            return;
        }
        if (url.pathname === '/api/v1/departments') {
            await json(route, []);
            return;
        }
        if (url.pathname === '/api/v1/dashboard/overview') {
            await json(route, overview());
            return;
        }
        if (url.pathname === '/api/v1/dashboard/available-periods') {
            await json(route, { years: [2026], current_quarter: '2026-Q3' });
            return;
        }
        if (url.pathname === '/api/v1/dashboard/quarterly-comparison') {
            await json(route, quarterlyComparison());
            return;
        }
        if (url.pathname === '/api/v1/dashboard/committee-summary') {
            await json(route, {
                critical_risks: [],
                critical_risks_total: 0,
                critical_vendors: [],
                critical_vendors_total: 0,
                can_view_vendors: true,
                recent_activity: [],
                department_exposure: [{ id: 7, name: 'Operations', total_exposure: 44, risk_count: 3 }],
            });
            return;
        }
        if (url.pathname === '/api/v1/issues') {
            await json(route, {
                items: [],
                total: 0,
                offset: 0,
                limit: 25,
                groups: [],
                capabilities: {
                    can_create: false,
                    can_export: true,
                    can_view_vendor_contexts: true,
                },
                facets: {},
            });
            return;
        }
        if (url.pathname === '/api/v1/risks/165') {
            await json(route, risk());
            return;
        }
        if (url.pathname === '/api/v1/risks') {
            await json(route, {
                items: [risk()],
                total: 1,
                offset: 0,
                limit: 25,
                groups: [],
                capabilities: {
                    can_create: false,
                    can_export: false,
                    can_view_vendor_contexts: true,
                },
                facets: {},
            });
            return;
        }
        if (
            url.pathname === '/api/v1/risks/165/controls'
            || url.pathname === '/api/v1/risks/165/vendors'
            || url.pathname === '/api/v1/risks/165/threat-links'
            || url.pathname === '/api/v1/risks/165/process-links'
            || url.pathname === '/api/v1/risks/165/asset-links'
            || url.pathname === '/api/v1/risks/165/questionnaires'
            || url.pathname === '/api/v1/kris/overdue'
            || url.pathname === '/api/v1/riskhub/public-risk-types'
        ) {
            await json(route, []);
            return;
        }
        if (url.pathname.startsWith('/api/v1/riskhub/public-config/')) {
            const value = url.pathname.includes('critical') ? 16 : url.pathname.includes('high') ? 10 : 5;
            await json(route, { value });
            return;
        }
        if (url.pathname === '/api/v1/auth/csrf') {
            await route.fulfill({ status: 204 });
            return;
        }

        await json(route, { detail: `Issue 165 route not mocked: ${request.method()} ${url.pathname}` }, 404);
    });
}

async function assertDesktopSurface(page: Page, name: string, axeScope = 'main') {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.locator(axeScope).evaluate(async (element) => {
        const finiteAnimations = element.getAnimations({ subtree: true }).filter((animation) => (
            animation.effect?.getComputedTiming().iterations !== Infinity
        ));
        await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => undefined)));
    });
    const analysis = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).include(axeScope).analyze();
    assertZeroAxeFindings(toFindings(analysis.violations), name);
}

async function openJourney(browser: Browser, journey: typeof JOURNEYS[number]) {
    const context = await browser.newContext({
        timezoneId: 'Europe/Prague',
        viewport: journey.viewport,
    });
    await context.addInitScript((locale) => {
        localStorage.setItem('riskhub-language', locale);
        localStorage.setItem('riskhub-theme', 'riskhub');
    }, journey.locale);
    const page = await context.newPage();
    await installMockApi(page, journey.locale);
    await page.goto('/login');
    await page.getByRole('button', { name: /Issue 165 CRO/ }).click();
    await expect(page).toHaveURL(/\/$/);
    return { context, page };
}

test.describe('Issue #165 desktop evidence integrity', () => {
    for (const journey of JOURNEYS) {
        test(`${journey.locale} dashboard is truthful and axe-clean at ${journey.viewport.width}x${journey.viewport.height}`, async ({ browser }) => {
            const { context, page } = await openJourney(browser, journey);
            try {
                const status = page.getByRole('status').filter({ hasText: journey.labels.updated });
                await expect(status).toContainText(journey.labels.generatedTime);
                await expect(page.getByText(/^(Live|Stable|Urgent|Calculated|Živo|Stabilní|Naléhavé|Vypočteno)$/)).toHaveCount(0);

                const averageCard = page.getByRole('button').filter({ hasText: journey.labels.average });
                await expect(averageCard).toHaveAccessibleName(new RegExp(journey.labels.critical));

                await page.getByRole('button', { name: journey.labels.committee, exact: true }).click();
                await expect(page.getByRole('status')).toHaveCount(0);
                await expect(page.getByRole('heading', { name: journey.labels.departmentExposure })).toBeVisible();
                await expect(page.getByText(journey.labels.riskCount, { exact: true })).toBeVisible();
                await expect(page.getByText(journey.labels.newFromZero, { exact: true })).toBeVisible();
                await expect(page.getByText('N/A', { exact: true })).toBeVisible();
                await expect(page.getByText('2026-07-01T00:00:00+00:00 – 2026-08-15T12:00:00+00:00')).toBeVisible();
                const stockEvidence = page.getByLabel(journey.labels.stockEvidence, { exact: true });
                await expect(stockEvidence.getByText(journey.labels.stockCurrent, { exact: true })).toBeVisible();
                await expect(stockEvidence.getByText(journey.labels.stockCompare, { exact: true })).toBeVisible();
                await expect(page.getByRole('progressbar', { name: /Operations: 44/ })).toHaveAttribute('aria-valuenow', '44');

                await assertDesktopSurface(
                    page,
                    `Issue 165 ${journey.locale} ${journey.viewport.width}x${journey.viewport.height}`,
                );

                await page.locator('a[href="/issues"]').click();
                await page.getByTestId('issues-export-button').click();
                const exportDialog = page.getByTestId('issues-export-dialog');
                await expect(exportDialog).toBeVisible();
                await expect(exportDialog.getByTestId('export-purpose-evaluation')).toBeVisible();
                await expect(exportDialog.getByTestId('export-purpose-point-in-time')).toHaveCount(0);
                await exportDialog.getByRole('radio', { name: journey.labels.issueEvaluation }).check();
                await expect(exportDialog.getByText(journey.labels.issueEvaluation, { exact: true })).toBeVisible();
                await expect(exportDialog.getByText(journey.labels.issueEvaluationDate, { exact: true })).toBeVisible();
                await assertDesktopSurface(
                    page,
                    `Issue 165 Issue evaluation ${journey.locale} ${journey.viewport.width}x${journey.viewport.height}`,
                    '[data-testid="issues-export-dialog"]',
                );

                await page.keyboard.press('Escape');
                await page.locator('a[href="/risks"]').click();
                await page.locator('a[href^="/risks/165"]').first().click();
                await expect(page.getByRole('heading', { name: journey.labels.riskScores })).toBeVisible();
                await assertDesktopSurface(
                    page,
                    `Issue 165 Risk scores ${journey.locale} ${journey.viewport.width}x${journey.viewport.height}`,
                );

                await page.getByRole('tab', { name: journey.labels.questionnaires }).click();
                await expect(page.getByRole('heading', { name: journey.labels.questionnaires })).toBeVisible();
                await assertDesktopSurface(
                    page,
                    `Issue 165 Risk questionnaires ${journey.locale} ${journey.viewport.width}x${journey.viewport.height}`,
                );
            } finally {
                await context.close();
            }
        });
    }
});
