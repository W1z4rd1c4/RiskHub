import { describe, expect, it } from 'vitest';

import { buildDashboardStats } from '@/pages/dashboard/dashboardStats';

describe('dashboardStats', () => {
    const t = (key: string) => key;

    it('counts only active departments with risks or controls and appends issue stats when readable', () => {
        const stats = buildDashboardStats({
            canReadIssues: true,
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
                average_net_risk_score: 3,
                total_vendors: 6,
            },
            t,
        });

        expect(stats.map((stat) => stat.title)).toContain('issues.summary.open_issues');
        expect(stats.find((stat) => stat.title === 'stats.active_depts')?.value).toBe(2);
        expect(stats.find((stat) => stat.title === 'issues.summary.open_issues')?.value).toBe(4);
    });
});
