import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DepartmentStatsGrid } from '@/pages/departments/DepartmentStatsGrid';
import { departmentDetailSchema } from '@/services/api/schemas';
import type { DepartmentDetail } from '@/services/departmentApi';

describe('DepartmentStatsGrid', () => {
    it('renders unavailable domain totals as N/A instead of a factual zero', () => {
        const department = departmentDetailSchema.parse({
            id: 4,
            name: 'Operations',
            code: 'OPS',
            description: null,
            created_at: '2026-05-07T12:00:00Z',
            updated_at: '2026-05-07T12:00:00Z',
            user_count: 2,
            risk_count: 7,
            high_risk_count: 1,
            control_count: null,
            kri_count: 3,
            kri_monitoring_counts: { breach: 1 },
            issue_count: null,
            overdue_issue_count: null,
            process_count: null,
            process_accountability_gap_count: null,
            asset_count: null,
            asset_accountability_gap_count: null,
            vendor_count: null,
            significant_vendor_count: null,
            risk_distribution: {
                critical: 0,
                high: 1,
                medium: 4,
                low: 2,
            },
            risk_by_status: {},
            control_stats: null,
            recent_executions: [],
        });

        render(
            <DepartmentStatsGrid
                department={department}
                onSelectTab={vi.fn()}
            />,
        );

        expect(screen.getByTestId('department-overview-card-risks')).toHaveTextContent('7');
        expect(screen.getByTestId('department-overview-card-kris')).toHaveTextContent('3');
        for (const domain of ['controls', 'issues', 'processes', 'assets', 'vendors']) {
            const card = screen.getByTestId(`department-overview-card-${domain}`);
            expect(card).toHaveTextContent('N/A');
            expect(card).not.toHaveTextContent('0');
        }
    });

    it('uses the backend high-risk total as the Risk card health count', () => {
        const department = {
            id: 3,
            name: 'Operations',
            code: 'OPS',
            description: null,
            created_at: '2026-05-07T12:00:00Z',
            updated_at: '2026-05-07T12:00:00Z',
            user_count: 2,
            risk_count: 20,
            high_risk_count: 3,
            control_count: 4,
            kri_count: 5,
            kri_monitoring_counts: { breach: 1 },
            risk_distribution: {
                critical: 4,
                high: 5,
                medium: 7,
                low: 4,
            },
            risk_by_status: {},
            control_stats: {
                total: 4,
                active: 4,
                inactive: 0,
                by_form: {},
                by_frequency: {},
            },
            recent_executions: [],
        } satisfies DepartmentDetail;

        render(
            <DepartmentStatsGrid
                department={department}
                onSelectTab={vi.fn()}
            />,
        );

        const riskCard = screen.getByTestId('department-overview-card-risks');
        expect(riskCard).toHaveTextContent('3');
        expect(riskCard).not.toHaveTextContent('9');
    });
});
