import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@test/queryClient';

const fetchOverviewMock = vi.fn();
const fetchDashboardSummaryMock = vi.fn();
let canViewCommitteeMock = false;

vi.mock('@/contexts/DashboardFilterContext', () => ({
    useDashboardFilters: () => ({
        filters: {
            departmentId: null,
            riskLevel: 'all',
            controlStatus: null,
            controlForm: null,
        },
    }),
}));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({
        canViewCommittee: canViewCommitteeMock,
    }),
}));

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        hasPermission: (resource: string, action: string) => resource === 'issues' && action === 'read',
    }),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/dashboardApi', () => ({
    dashboardApi: {
        fetchOverview: (...args: unknown[]) => fetchOverviewMock(...args),
        fetchDashboardSummary: (...args: unknown[]) => fetchDashboardSummaryMock(...args),
    },
}));

vi.mock('@/services/reportApi', () => ({
    reportApi: {
        downloadSummaryCsv: vi.fn(),
    },
}));

vi.mock('@/components/dashboard/FilterBar', () => ({ FilterBar: () => <div>filter bar</div> }));
vi.mock('@/components/dashboard/RiskDistributionMatrix', () => ({ RiskDistributionMatrix: () => <div>risk matrix</div> }));
vi.mock('@/components/dashboard/RiskDrilldownModal', () => ({ RiskDrilldownModal: () => null }));
vi.mock('@/components/dashboard/ControlTrendChart', () => ({ ControlTrendChart: () => <div>control trends</div> }));
vi.mock('@/components/dashboard/DepartmentTable', () => ({ DepartmentTable: () => <div>department table</div> }));
vi.mock('@/components/dashboard/CategoryBreakdownCharts', () => ({ CategoryBreakdownCharts: () => <div>category charts</div> }));
vi.mock('@/components/dashboard/KRIBreachWidget', () => ({ KRIBreachWidget: () => <div>kri widget</div> }));
vi.mock('@/components/dashboard/KRIStatusWidget', () => ({ KRIStatusWidget: () => <div>kri status</div> }));
vi.mock('@/components/dashboard/RiskTrendChart', () => ({ RiskTrendChart: () => <div>risk trends</div> }));
vi.mock('@/components/dashboard/KRIBreachHistoryChart', () => ({ KRIBreachHistoryChart: () => <div>kri history</div> }));
vi.mock('@/components/dashboard/RiskCommitteeSection', () => ({ RiskCommitteeSection: () => <div>committee</div> }));
vi.mock('@/components/dashboard/IssueAgingChart', () => ({ IssueAgingChart: () => <div>issue aging</div> }));
vi.mock('@/components/dashboard/OpenIssuesBySeverityChart', () => ({ OpenIssuesBySeverityChart: () => <div>issue severity</div> }));
vi.mock('@/components/dashboard/IssuesSummaryCard', () => ({ IssuesSummaryCard: () => <div>issue summary</div> }));

import { DashboardPage } from '@/pages/DashboardPage';

function createWrapper() {
    const queryClient = createTestQueryClient();

    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('DashboardPage overview aggregation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        canViewCommitteeMock = false;
        fetchOverviewMock.mockResolvedValue({
            summary: {
                total_controls: 10,
                controls_by_status: {},
                controls_by_form: {},
                controls_by_frequency: {},
                total_risks: 8,
                risks_by_status: {},
                critical_risks_count: 2,
                average_net_risk_score: 4,
            },
            department_metrics: [],
            gross_distribution: { distribution: [] },
            net_distribution: { distribution: [] },
            control_trends: [],
            risk_trends: [],
            kri_breach_trends: [],
            issue_summary: {
                open_issues: 1,
                overdue_issues: 0,
                high_severity_open: 0,
                median_days_open: 2,
            },
            issue_aging: { buckets: [] },
            issue_severity: { items: [] },
            generated_at: '2026-03-07T10:00:00Z',
            capabilities: {
                can_read: true,
                can_view_issue_metrics: true,
                can_view_committee: canViewCommitteeMock,
                can_view_vendor_metrics: true,
                can_use_department_filter: true,
                can_export_or_report: true,
            },
        });
    });

    it('loads the dashboard via the aggregate overview endpoint', async () => {
        render(
            <MemoryRouter>
                <DashboardPage />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(fetchOverviewMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
        expect(fetchDashboardSummaryMock).not.toHaveBeenCalled();
        expect(screen.getByText('title')).toBeInTheDocument();
        expect(screen.getByText('issue summary')).toBeInTheDocument();
    });

    it('stops overview fetching when the committee view is active', async () => {
        canViewCommitteeMock = true;
        fetchOverviewMock.mockResolvedValueOnce({
            summary: {
                total_controls: 10,
                controls_by_status: {},
                controls_by_form: {},
                controls_by_frequency: {},
                total_risks: 8,
                risks_by_status: {},
                critical_risks_count: 2,
                average_net_risk_score: 4,
            },
            department_metrics: [],
            gross_distribution: { distribution: [] },
            net_distribution: { distribution: [] },
            control_trends: [],
            risk_trends: [],
            kri_breach_trends: [],
            issue_summary: {
                open_issues: 1,
                overdue_issues: 0,
                high_severity_open: 0,
                median_days_open: 2,
            },
            issue_aging: { buckets: [] },
            issue_severity: { items: [] },
            generated_at: '2026-03-07T10:00:00Z',
            capabilities: {
                can_read: true,
                can_view_issue_metrics: true,
                can_view_committee: true,
                can_view_vendor_metrics: true,
                can_use_department_filter: true,
                can_export_or_report: true,
            },
        });

        render(
            <MemoryRouter>
                <DashboardPage />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(fetchOverviewMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
        fetchOverviewMock.mockClear();

        fireEvent.click(screen.getByRole('button', { name: /views\.risk_committee/ }));

        expect(await screen.findByText('committee')).toBeInTheDocument();
        expect(fetchOverviewMock).not.toHaveBeenCalled();
    });

    it('hides optional dashboard actions when backend capabilities are missing', async () => {
        fetchOverviewMock.mockResolvedValueOnce({
            summary: {
                total_controls: 10,
                controls_by_status: {},
                controls_by_form: {},
                controls_by_frequency: {},
                total_risks: 8,
                risks_by_status: {},
                critical_risks_count: 2,
                average_net_risk_score: 4,
            },
            department_metrics: [],
            gross_distribution: { distribution: [] },
            net_distribution: { distribution: [] },
            control_trends: [],
            risk_trends: [],
            kri_breach_trends: [],
            issue_summary: {
                open_issues: 1,
                overdue_issues: 0,
                high_severity_open: 0,
                median_days_open: 2,
            },
            issue_aging: { buckets: [] },
            issue_severity: { items: [] },
            generated_at: '2026-03-07T10:00:00Z',
        });

        render(
            <MemoryRouter>
                <DashboardPage />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(fetchOverviewMock).toHaveBeenCalledTimes(1));
        expect(screen.queryByTitle('actions.export_summary_excel')).not.toBeInTheDocument();
        expect(screen.queryByText('issue summary')).not.toBeInTheDocument();
    });
});
