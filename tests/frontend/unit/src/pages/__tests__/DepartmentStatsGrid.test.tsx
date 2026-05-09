import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DepartmentStatsGrid } from '@/pages/departments/DepartmentStatsGrid';
import type { DepartmentDetail } from '@/services/departmentApi';

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskThresholds: () => ({
        thresholds: {
            medium: 6,
            high: 12,
            critical: 20,
        },
    }),
}));

describe('DepartmentStatsGrid', () => {
    it('uses high_risk_count for the high-risk card instead of static distribution buckets', () => {
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
                activeTab="risks"
                department={department}
                kriFilter="all"
                riskFilter="high"
                onSelectControls={vi.fn()}
                onSelectHighRisks={vi.fn()}
                onSelectKriBreach={vi.fn()}
                onSelectKris={vi.fn()}
                onSelectRisks={vi.fn()}
                onSelectUsers={vi.fn()}
            />,
        );

        expect(screen.getByTitle('Net score >= 12')).toHaveTextContent('3');
        expect(screen.getByTitle('Net score >= 12')).not.toHaveTextContent('9');
    });
});
