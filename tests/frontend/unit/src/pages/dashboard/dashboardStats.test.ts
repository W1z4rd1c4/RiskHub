import { describe, expect, it } from 'vitest';

import { buildDashboardStats } from '@/pages/dashboard/dashboardStats';

describe('dashboardStats', () => {
    const t = (key: string) => key;

    it('counts only active departments with risks or controls and appends issue stats when readable', () => {
        const stats = buildDashboardStats({
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
            bg: 'bg-white/5',
            color: 'text-slate-400',
            context: undefined,
        });
    });

    it('preserves the Total Controls stat for actors who can read controls', () => {
        const stats = buildDashboardStats({
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
