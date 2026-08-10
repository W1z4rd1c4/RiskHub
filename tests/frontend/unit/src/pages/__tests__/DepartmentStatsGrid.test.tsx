import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DepartmentStatsGrid } from '@/pages/departments/DepartmentStatsGrid';
import { departmentDetailSchema } from '@/services/api/schemas';
import type { DepartmentDetail } from '@/services/departmentApi';

const department = {
    id: 3,
    name: 'Operations',
    code: 'OPS',
    description: null,
    created_at: '2026-05-07T12:00:00Z',
    updated_at: '2026-05-07T12:00:00Z',
    user_count: 2,
    risk_count: 20,
    high_risk_count: 9,
    control_count: 21,
    attention_control_count: 3,
    kri_count: 22,
    kri_monitoring_counts: { breach: 1, not_submitted: 2 },
    issue_count: 23,
    open_issue_count: 6,
    overdue_issue_count: 7,
    process_count: 24,
    critical_process_count: 8,
    cif_process_count: 9,
    asset_count: 25,
    critical_asset_count: 10,
    legacy_asset_count: 11,
    vendor_count: 26,
    critical_vendor_count: 12,
    dora_vendor_count: 13,
    risk_distribution: { critical: 4, high: 5, medium: 7, low: 4 },
    risk_by_status: {},
    control_stats: { total: 21, active: 21, inactive: 0, by_form: {}, by_frequency: {} },
    recent_executions: [],
} satisfies DepartmentDetail;

describe('DepartmentStatsGrid', () => {
    it('keeps the responsive eight-card layout and renders unavailable metrics as N/A', () => {
        const unavailable = departmentDetailSchema.parse({
            ...department,
            control_count: null,
            attention_control_count: null,
            issue_count: null,
            open_issue_count: null,
            overdue_issue_count: null,
            process_count: null,
            critical_process_count: null,
            cif_process_count: null,
            asset_count: null,
            critical_asset_count: null,
            legacy_asset_count: null,
            vendor_count: null,
            critical_vendor_count: null,
            dora_vendor_count: null,
        });

        render(<DepartmentStatsGrid department={unavailable} onSelectTab={vi.fn()} />);

        const grid = screen.getByTestId('department-stats-grid');
        expect(grid).toHaveClass(
            'grid-cols-1',
            'sm:grid-cols-2',
            'xl:grid-cols-4',
        );
        expect(grid.children).toHaveLength(8);
        for (const domain of ['controls', 'issues', 'processes', 'assets', 'vendors']) {
            expect(screen.getByTestId(`department-overview-card-${domain}`)).toHaveTextContent('N/A');
        }
    });

    it('exposes every total as an independently named, unfiltered action', async () => {
        const user = userEvent.setup();
        const onSelectTab = vi.fn();
        render(<DepartmentStatsGrid department={department} onSelectTab={onSelectTab} />);

        const totals = [
            ['risks', 'Risks 20'],
            ['controls', 'Controls 21'],
            ['kris', 'KRIs 22'],
            ['issues', 'Issues 23'],
            ['processes', 'Processes 24'],
            ['assets', 'Assets 25'],
            ['vendors', 'Vendors 26'],
            ['users', 'Users 2'],
        ] as const;

        for (const [tab, name] of totals) {
            await user.click(within(screen.getByTestId(`department-overview-card-${tab}`)).getByRole('button', { name }));
            expect(onSelectTab).toHaveBeenLastCalledWith(tab);
        }
    });

    it('exposes every health metric as a sibling action with the canonical register filter', async () => {
        const user = userEvent.setup();
        const onSelectTab = vi.fn();
        render(<DepartmentStatsGrid department={department} onSelectTab={onSelectTab} />);

        const actions = [
            ['risks', 'Risks 5 high', { net_band: 'Vysoké' }],
            ['risks', 'Risks 4 critical', { net_band: 'Kritické' }],
            ['controls', 'Controls 3 attention', { monitoring_status: 'needs_review' }],
            ['kris', 'KRIs 1 breaches', { monitoring_status: 'breach' }],
            ['kris', 'KRIs 2 overdue', { monitoring_status: 'not_submitted' }],
            ['issues', 'Issues 6 open', { status: 'open' }],
            ['issues', 'Issues 7 overdue', { overdue: true }],
            ['processes', 'Processes 8 critical', { criticality: ['critical'] }],
            ['processes', 'Processes 9 CIF', { cif: true }],
            ['assets', 'Assets 10 critical', { criticality: ['critical'] }],
            ['assets', 'Assets 11 legacy', { legacy: true }],
            ['vendors', 'Vendors 12 critical', { tiers: ['critical'] }],
            ['vendors', 'Vendors 13 DORA', { dora_relevant: true }],
            ['users', 'Users 2 active', undefined],
        ] as const;

        for (const [tab, name, filters] of actions) {
            const card = screen.getByTestId(`department-overview-card-${tab}`);
            const healthAction = within(card).getByRole('button', { name });
            expect(
                screen.getByTestId(`department-overview-card-${tab}-total`),
            ).not.toContainElement(healthAction);
            await user.click(healthAction);
            if (filters) expect(onSelectTab).toHaveBeenLastCalledWith(tab, filters);
            else expect(onSelectTab).toHaveBeenLastCalledWith(tab, undefined);
        }
    });
});
