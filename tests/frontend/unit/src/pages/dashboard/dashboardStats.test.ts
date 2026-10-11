import { describe, expect, it } from 'vitest';

import { buildDashboardDrillthrough, buildDashboardStats } from '@/pages/dashboard/dashboardStats';

import { parseRegisterUrlState } from '@/pages/shared/registerListQuery';
import { buildRiskRegisterListParams, parseRiskRegisterFilters } from '@/pages/risks/riskRegisterConfig';
import { buildKriRegisterListParams, parseKriRegisterFilters } from '@/pages/kris/kriRegisterConfig';
import { buildIssueRegisterListParams, parseIssueRegisterFilters } from '@/pages/issues/issueRegisterConfig';
import { buildVendorRegisterListParams, parseVendorRegisterFilters } from '@/pages/vendors/vendorRegisterConfig';
import { buildRiskCollectionQuery } from '@/services/riskApi';
import { buildKriCollectionQuery } from '@/services/kriApi';
import { buildIssueCollectionQuery } from '@/services/issuesApi';
import { buildVendorCollectionQuery } from '@/services/vendorApi';

const listState = { currentPage: 1, groupValue: null, limit: 100, search: '', sort: null, view: 'all' as const };

describe('dashboardStats', () => {
    const t = (key: string) => key;

    it.each([null, 17])('keeps the Issues tile exception policy and department %s in canonical criteria (DEF-06)', (departmentId) => {
        const options = {
            canReadControls: false, canReadIssues: true, canReadVendors: true,
            departmentMetrics: [], issueSummary: null, summary: null, t,
            filters: { departmentId, riskLevel: 'high' as const, controlStatus: null, controlForm: null },
        };
        const stats = buildDashboardStats(options);
        const issues = stats.find((stat) => stat.title === 'issues.summary.open_issues')!;
        const url = new URL(issues.path, 'https://riskhub.test');
        const filters = JSON.parse(url.searchParams.get('filters') ?? '{}');
        expect(filters).toEqual({ include_closed: false, exclude_active_exceptions: true, ...(departmentId ? { department_id: departmentId } : {}) });
        expect(url.searchParams.has('riskLevel')).toBe(false);
        const vendors = new URL(stats.find((stat) => stat.title === 'stats.vendors')!.path, url);
        expect(JSON.parse(vendors.searchParams.get('filters') ?? '{}')).toEqual(departmentId ? { department_ids: [departmentId] } : {});
    });

    it.each([null, 17])('round-trips every released destination through its actual register and request adapters, department=%s', (departmentId) => {
        const activeFilters = { departmentId, riskLevel: 'high' as const, controlStatus: 'draft', controlForm: 'manual' };
        const links = buildDashboardDrillthrough(activeFilters);
        const department = departmentId === null ? {} : { department_id: departmentId };
        const cases = [
            [links.issues.open, '/issues', { include_closed: false, exclude_active_exceptions: true, ...department }],
            [links.issues.overdue, '/issues', { include_closed: false, exclude_active_exceptions: true, ...department, overdue: true }],
            [links.issues.highSeverity, '/issues', { include_closed: false, exclude_active_exceptions: true, ...department, severity_group: 'high_critical' }],
            [links.kris.overdue, '/kris', { ...department, monitoring_status: 'not_submitted' }],
            [links.kris.dueSoon, '/kris', { ...department, timeliness_status: 'due_soon' }],
            [links.vendors, '/vendors', departmentId === null ? {} : { department_ids: [departmentId] }],
            [links.committee.criticalRisks, '/risks', { critical: true }],
            [links.committee.highRiskVendors, '/vendors', { risk_scores: [4, 5] }],
        ] as const;
        for (const [href, route, expected] of cases) {
            const url = new URL(href, 'https://riskhub.test');
            expect(url.pathname).toBe(route);
            const parsed = parseRegisterUrlState(url.searchParams, { defaultView: 'all' });
            expect(parsed.filters).toEqual(expected);
            let wire: URLSearchParams;
            if (route === '/issues') wire = buildIssueCollectionQuery(buildIssueRegisterListParams({ ...listState, filters: parseIssueRegisterFilters(parsed.filters) }));
            else if (route === '/kris') wire = buildKriCollectionQuery(buildKriRegisterListParams({ ...listState, filters: parseKriRegisterFilters(parsed.filters) }));
            else if (route === '/vendors') wire = buildVendorCollectionQuery(buildVendorRegisterListParams({ ...listState, filters: parseVendorRegisterFilters(parsed.filters) }));
            else wire = buildRiskCollectionQuery(buildRiskRegisterListParams({ ...listState, criticalMinNetScore: 20, filters: parseRiskRegisterFilters(parsed.filters) }));
            const actual = wire.has('filters') ? JSON.parse(wire.get('filters')!) : Object.fromEntries(wire);
            if (route === '/risks') {
                expect(actual).toMatchObject({ critical: true, status: 'active', lifecycle: 'active' });
                expect(actual).not.toHaveProperty('net_band');
            } else if (route === '/vendors') {
                expect(wire.getAll('department_ids')).toEqual('department_ids' in expected ? ['17'] : []);
                expect(wire.getAll('risk_scores')).toEqual('risk_scores' in expected ? ['4', '5'] : []);
            } else expect(actual).toMatchObject(expected);
            expect(actual).not.toHaveProperty('riskLevel');
            expect(actual).not.toHaveProperty('control_form');
        }
    });

    it('counts only active departments with risks or controls and appends issue stats when readable', () => {
        const stats = buildDashboardStats({
            filters: { departmentId: null, riskLevel: 'all', controlStatus: null, controlForm: null },
            canReadControls: true,
            canReadIssues: true,
            canReadVendors: true,
            departmentMetrics: [
                { department_id: 1, department_name: 'Ops', risk_count: 0, control_count: 0 },
                { department_id: 2, department_name: 'IT', risk_count: 1, control_count: 0 },
                { department_id: 3, department_name: 'Fin', risk_count: 0, control_count: 2 },
            ],
            issueSummary: {
                open_issues: 4,
                overdue_issues: 1,
                high_severity_open: 2,
                median_days_open: 7,
            },
            summary: {
                total_controls: 9,
                controls_by_status: {},
                controls_by_form: {},
                controls_by_frequency: {},
                total_risks: 5,
                risks_by_status: {},
                critical_risks_count: 2,
                average_net_risk_score: 12,
                risk_thresholds: { critical: 12, high: 8, medium: 4 },
                total_vendors: 6,
            },
            t,
        });

        expect(stats.map((stat) => stat.title)).toContain('issues.summary.open_issues');
        expect(stats.find((stat) => stat.title === 'stats.active_depts')?.value).toBe(2);
        expect(stats.find((stat) => stat.title === 'issues.summary.open_issues')?.value).toBe(4);
        expect(stats.find((stat) => stat.title === 'stats.avg_risk_score')).toMatchObject({
            context: 'risk_levels.critical',
        });
        expect(stats.every((stat) => !('trend' in stat))).toBe(true);
    });

    it('does not quantify permission-hidden vendor metrics', () => {
        const stats = buildDashboardStats({
            filters: { departmentId: null, riskLevel: 'all', controlStatus: null, controlForm: null },
            canReadControls: false,
            canReadIssues: false,
            canReadVendors: false,
            departmentMetrics: [],
            issueSummary: null,
            summary: {
                total_controls: 0,
                controls_by_status: {},
                controls_by_form: {},
                controls_by_frequency: {},
                total_risks: 0,
                risks_by_status: {},
                critical_risks_count: 0,
                average_net_risk_score: 0,
                risk_thresholds: { critical: 12, high: 8, medium: 4 },
                total_vendors: 0,
            },
            t,
        });

        expect(stats.map((stat) => stat.title)).not.toContain('stats.vendors');
        expect(stats.map((stat) => stat.title)).not.toContain('stats.total_controls');
        expect(stats.find((stat) => stat.title === 'stats.avg_risk_score')).toMatchObject({
            bg: 'bg-tint/5',
            color: 'text-muted-foreground',
            context: undefined,
        });
    });

    it('preserves the Total Controls stat for actors who can read controls', () => {
        const stats = buildDashboardStats({
            filters: { departmentId: null, riskLevel: 'all', controlStatus: null, controlForm: null },
            canReadControls: true,
            canReadIssues: false,
            canReadVendors: false,
            departmentMetrics: [],
            issueSummary: null,
            summary: {
                total_controls: 9,
                controls_by_status: {},
                controls_by_form: {},
                controls_by_frequency: {},
                total_risks: 0,
                risks_by_status: {},
                critical_risks_count: 0,
                average_net_risk_score: 0,
                risk_thresholds: { critical: 12, high: 8, medium: 4 },
                total_vendors: 0,
            },
            t,
        });

        expect(stats.find((stat) => stat.title === 'stats.total_controls')).toMatchObject({
            path: '/controls',
            value: 9,
        });
    });
});
