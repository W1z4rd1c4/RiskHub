import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DepartmentTabContent } from '@/pages/departments/DepartmentTabContent';
import { departmentDetailSchema } from '@/services/api/schemas';

function parseDepartment(recentExecutions: [] | null) {
    return departmentDetailSchema.parse({
        id: 7,
        name: 'Compliance',
        code: 'CMP',
        description: null,
        created_at: '2026-07-31T00:00:00Z',
        updated_at: '2026-07-31T00:00:00Z',
        user_count: null,
        risk_count: null,
        high_risk_count: null,
        control_count: null,
        kri_count: null,
        kri_monitoring_counts: null,
        issue_count: null,
        overdue_issue_count: null,
        process_count: null,
        process_accountability_gap_count: null,
        asset_count: null,
        asset_accountability_gap_count: null,
        vendor_count: null,
        significant_vendor_count: null,
        risk_distribution: null,
        risk_by_status: null,
        control_stats: null,
        recent_executions: recentExecutions,
    });
}

function renderOverview(recentExecutions: [] | null) {
    render(
        <MemoryRouter>
            <DepartmentTabContent
                activeTab="overview"
                department={parseDepartment(recentExecutions)}
                onSelectTab={vi.fn()}
            />
        </MemoryRouter>,
    );
    return screen.getByTestId('department-overview-activity');
}

describe('Department Overview recent activity', () => {
    it('renders unavailable instead of factual empty when recent executions are not authorized', () => {
        const panel = renderOverview(null);
        expect(panel).toHaveTextContent('N/A');
        expect(panel).not.toHaveTextContent('No recent activity');
    });

    it('renders factual empty when an authorized reader has no recent executions', () => {
        const panel = renderOverview([]);
        expect(panel).toHaveTextContent('No recent activity');
        expect(panel).not.toHaveTextContent('N/A');
    });
});
