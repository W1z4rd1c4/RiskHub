import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Download, type Page, type Route } from '@playwright/test';

import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from './helpers/axeBaseline';

type Locale = 'en' | 'cs';

const JOURNEYS = [
    {
        locale: 'en' as const,
        viewport: { width: 1024, height: 768 },
        labels: {
            average: 'Avg Risk Score',
            critical: 'Critical',
            criticalRisks: 'Critical Risks',
            committee: 'Risk Committee',
            controlFormChip: 'Form: Manual',
            controlStatusChip: 'Status: Active',
            departmentExposure: 'Sum of net Risk scores',
            exportSummary: 'Export Summary CSV',
            generatedTime: 'Sep 1, 2026, 05:45 PM',
            ictCommittee: 'ICT Committee',
            ictControlled: ['High', 'Above tolerance', 'Accepted', 'Critical vendor'],
            issueEvaluation: 'Current register evaluated on a date',
            issueEvaluationDate: 'Evaluation date',
            newFromZero: 'New (from 0) +3',
            noCriticalRisks: 'No critical risks at this time',
            noVendors: 'No vendors in scope',
            questionnaires: 'Assessment questionnaires',
            restricted: 'Restricted by access scope',
            riskLevelChip: 'Risk Level: Critical',
            riskCount: '3 Risks',
            riskScores: 'Gross and net Risk scores',
            stockCompare: '2026-Q2 · Stored 2026-07-01T00:00:00+00:00',
            stockCurrent: '2026-Q3 · Live 2026-08-15T12:00:00+00:00',
            stockEvidence: 'Stock observations',
            totalControls: 'Total Controls',
            updated: 'Updated',
            vendors: 'Vendors',
        },
    },
    {
        locale: 'cs' as const,
        viewport: { width: 1440, height: 900 },
        labels: {
            average: 'Průměrné skóre',
            critical: 'Kritické',
            criticalRisks: 'Kritická rizika',
            committee: 'Výbor pro řízení rizik',
            controlFormChip: 'Forma: Manuální',
            controlStatusChip: 'Stav: Aktivní',
            departmentExposure: 'Součet čistých skóre rizik',
            exportSummary: 'Exportovat souhrn do CSV',
            generatedTime: '1. 9. 2026 17:45',
            ictCommittee: 'Výbor pro řízení rizik ICT',
            ictControlled: ['Vysoké', 'NAD TOLERANCI', 'Akceptováno', 'Kritický dodavatel'],
            issueEvaluation: 'Aktuální registr vyhodnocený k datu',
            issueEvaluationDate: 'Datum vyhodnocení',
            newFromZero: 'Nové (z 0) +3',
            noCriticalRisks: 'Momentálně nejsou žádná kritická rizika',
            noVendors: 'Žádní dodavatelé v rozsahu',
            questionnaires: 'Hodnoticí dotazníky',
            restricted: 'Omezeno rozsahem přístupu',
            riskLevelChip: 'Úroveň rizika: Kritická',
            riskCount: '3 rizika',
            riskScores: 'Hrubé a čisté skóre rizika',
            stockCompare: '2026-Q2 · Uložená data 2026-07-01T00:00:00+00:00',
            stockCurrent: '2026-Q3 · Živá data 2026-08-15T12:00:00+00:00',
            stockEvidence: 'Stavová pozorování',
            totalControls: 'Celkem kontrol',
            updated: 'Aktualizováno',
            vendors: 'Dodavatelé',
        },
    },
] as const;

function json(route: Route, body: unknown, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function readMetricCsv(download: Download) {
    const stream = await download.createReadStream();
    let body = '';
    for await (const chunk of stream) body += String(chunk);

    const [header, ...rows] = body.trim().split(/\r?\n/);
    expect(header).toBe('Metric,Value');
    return Object.fromEntries(rows.map((row) => {
        const separator = row.indexOf(',');
        return [row.slice(0, separator), row.slice(separator + 1)];
    }));
}

function user() {
    const permissions = [
        'controls:read',
        'dashboard:read',
        'departments:read',
        'issues:read',
        'ict_committee:read',
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

function ictCommittee() {
    return {
        dashboard: {
            register_state: {
                process_count: 1,
                asset_count: 1,
                process_asset_link_count: 1,
                vendor_count: 1,
                assets_pending_review_count: 0,
                direct_process_vendor_link_count: 0,
                contracts_in_roi_scope_count: 0,
                sub_outsourcing_link_count: 0,
                assets_without_data_classification_count: 0,
                top_tier_vendors_without_orderly_exit_count: 0,
            },
            key_metrics: {
                cif_process_count: 1,
                processes_without_impact_assessment_count: 0,
                critical_asset_count: 1,
                critical_vendor_count: 1,
                risks_above_tolerance_count: 1,
                open_dq_finding_count: 0,
            },
        },
        cro: {
            kpi: {
                risk_count: 1,
                material_risk_count: 0,
                risks_above_tolerance_count: 1,
                accepted_above_tolerance_count: 1,
                cif_without_bcm_count: 0,
                open_dq_finding_count: 0,
                material_risk_count_production_inert: true,
            },
            heatmap: {
                rows: [5, 4, 3, 2, 1].map((probability) => ({
                    probability,
                    cells: probability === 5 ? [0, 0, 0, 0, 1] : [0, 0, 0, 0, 0],
                })),
            },
            migration_matrix: {
                rows: ['Nízké', 'Střední', 'Vysoké', 'Kritické'].map((gross_band) => ({
                    gross_band,
                    cells: gross_band === 'Kritické' ? [0, 0, 1, 0] : [0, 0, 0, 0],
                })),
            },
            top_risks: [{
                rank: 1,
                risk_id: 165,
                code: 'R-ICT-165',
                subject_label: 'Evidence review',
                threat_label: 'Service interruption',
                gross_score: 20,
                net_score: 12,
                net_band: 'Vysoké',
                vs_tolerance: 'NAD TOLERANCI',
                status_label: 'Akceptováno',
            }],
            top_vendors: [{
                rank: 1,
                vendor_id: 165,
                name: 'Evidence Vendor',
                cif_process_count: 1,
                tier: 'Kritický dodavatel',
            }],
            narratives: {
                cif_process_count: 1,
                process_count: 1,
                cif_with_bcm_count: 1,
                critical_vendor_count: 1,
                critical_vendors_with_functional_exit_count: 1,
                critical_vendors_with_identifier_count: 1,
                tolerance: 7,
                risks_above_tolerance_count: 1,
                accepted_above_tolerance_count: 1,
                sub_outsourcing_link_count: 0,
                vendors_in_sub_role_count: 0,
            },
            assets_by_criticality: [{ band: 'Kritická', count: 1 }],
            risks_by_band: [{ band: 'Kritické', gross_count: 1, net_count: 0 }],
        },
        roi_readiness: {
            templates: [],
            overall_readiness_pct: null,
            total_gap_row_count: 0,
        },
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
                post_login_redirect_to: null,
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
                critical_vendors_total: null,
                can_view_vendors: false,
                recent_activity: [],
                department_exposure: [{ id: 7, name: 'Operations', total_exposure: 44, risk_count: 3 }],
            });
            return;
        }
        if (url.pathname === '/api/v1/ict-register/committee') {
            await json(route, ictCommittee());
            return;
        }
        if (url.pathname === '/api/v1/reports/summary/export') {
            await route.fulfill({
                status: 200,
                contentType: 'text/csv',
                headers: { 'Content-Disposition': 'attachment; filename="dashboard-summary.csv"' },
                body: [
                    'Metric,Value',
                    'Generated At,2026-09-01T15:46:00+00:00',
                    'Scope,All actor-visible Dashboard records',
                    'Filter: Department,All actor-visible Departments',
                    'Filter: Risk Level,critical',
                    'Applies to: Risk Level,Risk metrics only',
                    'Filter: Control Status,active',
                    'Applies to: Control Status,Control metrics only',
                    'Filter: Control Form,manual',
                    'Applies to: Control Form,Control metrics only',
                    'Unaffected by Risk/Control Filters,Vendor metrics',
                    'Filter: Archived Records,excluded',
                    'Critical Risk Threshold,16',
                    'High Risk Threshold,10',
                    'Medium Risk Threshold,5',
                    'Total Controls,8',
                    'Total Risks,3',
                    'Critical Risks,1',
                    'Average Net Risk Score,17',
                    'Total Vendors,2',
                    'High-risk Vendors,0',
                ].join('\r\n'),
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
                await page.goto('/?riskLevel=invalid&controlStatus=retired&controlForm=preventive');
                await expect(page).toHaveURL(/\/login\?returnTo=/);
                await page.getByRole('button', { name: /Issue 165 CRO/ }).click();
                await expect.poll(() => new URL(page.url()).search).toBe('');

                await page.goto('/?riskLevel=critical&controlStatus=active&controlForm=manual');
                await expect(page).toHaveURL(/\/login\?returnTo=/);
                const overviewRequestPromise = page.waitForRequest((request) => {
                    const url = new URL(request.url());
                    return url.pathname === '/api/v1/dashboard/overview'
                        && url.searchParams.get('risk_level') === 'critical'
                        && url.searchParams.get('control_status') === 'active'
                        && url.searchParams.get('control_form') === 'manual';
                });
                await page.getByRole('button', { name: /Issue 165 CRO/ }).click();
                const overviewRequest = await overviewRequestPromise;
                const overviewUrl = new URL(overviewRequest.url());
                expect(overviewUrl.searchParams.get('risk_level')).toBe('critical');
                expect(overviewUrl.searchParams.get('control_status')).toBe('active');
                expect(overviewUrl.searchParams.get('control_form')).toBe('manual');
                expect(overviewUrl.searchParams.has('department_id')).toBe(false);

                const status = page.getByRole('status').filter({ hasText: journey.labels.updated });
                await expect(status).toContainText(journey.labels.generatedTime);
                await expect(page.getByText(/^(Live|Stable|Urgent|Calculated|Živo|Stabilní|Naléhavé|Vypočteno)$/)).toHaveCount(0);

                for (const chip of [
                    journey.labels.riskLevelChip,
                    journey.labels.controlStatusChip,
                    journey.labels.controlFormChip,
                ]) {
                    await expect(page.getByRole('button', { name: new RegExp(chip) })).toBeVisible();
                }
                await expect(page.getByTestId('dashboard-filter-scope-note')).toContainText(/access scope|rozsahu přístupu/);

                const averageCard = page.getByRole('button').filter({ hasText: journey.labels.average });
                await expect(averageCard).toContainText('17');
                await expect(averageCard).toHaveAccessibleName(new RegExp(journey.labels.critical));
                for (const [label, value] of [
                    [journey.labels.totalControls, '8'],
                    [journey.labels.criticalRisks, '1'],
                    [journey.labels.vendors, '2'],
                ] as const) {
                    await expect(page.getByRole('button').filter({ hasText: label })).toContainText(value);
                }

                const [summaryRequest, download] = await Promise.all([
                    page.waitForRequest((request) => new URL(request.url()).pathname === '/api/v1/reports/summary/export'),
                    page.waitForEvent('download'),
                    page.getByTitle(journey.labels.exportSummary).click(),
                ]);
                const summaryUrl = new URL(summaryRequest.url());
                expect(summaryRequest.method()).toBe('GET');
                expect(summaryRequest.headers().authorization).toBe('Bearer issue165-browser-token');
                expect(Object.fromEntries(summaryUrl.searchParams)).toEqual({
                    format: 'csv',
                    risk_level: 'critical',
                    control_status: 'active',
                    control_form: 'manual',
                });
                expect(download.suggestedFilename()).toBe('dashboard-summary.csv');
                expect(await readMetricCsv(download)).toMatchObject({
                    'Generated At': '2026-09-01T15:46:00+00:00',
                    Scope: 'All actor-visible Dashboard records',
                    'Filter: Department': 'All actor-visible Departments',
                    'Filter: Risk Level': 'critical',
                    'Filter: Control Status': 'active',
                    'Filter: Control Form': 'manual',
                    'Critical Risk Threshold': '16',
                    'Total Controls': '8',
                    'Total Risks': '3',
                    'Critical Risks': '1',
                    'Average Net Risk Score': '17',
                    'Total Vendors': '2',
                    'High-risk Vendors': '0',
                });

                await page.getByRole('button', { name: journey.labels.committee, exact: true }).click();
                await expect(page.getByRole('status')).toHaveCount(0);
                await expect(page.getByText(journey.labels.noCriticalRisks, { exact: true })).toBeVisible();
                await expect(page.getByText(journey.labels.restricted, { exact: true })).toBeVisible();
                await expect(page.getByText(journey.labels.noVendors, { exact: true })).toHaveCount(0);
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

                await page.getByRole('button', { name: journey.labels.ictCommittee, exact: true }).click();
                await expect(page).toHaveURL(/view=ict-committee/);
                const ictRisk = page.getByTestId('committee-top-risk-1');
                for (const controlledLabel of journey.labels.ictControlled.slice(0, 3)) {
                    await expect(ictRisk).toContainText(controlledLabel);
                }
                await expect(page.getByTestId('committee-top-vendor-1')).toContainText(journey.labels.ictControlled[3]);
                await expect(page.getByTestId('committee-risk-bar-gross-Kritické')).toHaveAttribute(
                    'href',
                    '/risks?committee_scope=true&ict_linked=true&gross_band=Kritick%C3%A9',
                );
                await assertDesktopSurface(
                    page,
                    `Issue 160 ICT Committee ${journey.locale} ${journey.viewport.width}x${journey.viewport.height}`,
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
