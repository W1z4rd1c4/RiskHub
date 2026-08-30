import { MemoryRouter, useLocation } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@test/queryClient';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';

const fetchOverviewMock = vi.fn();
const fetchDashboardSummaryMock = vi.fn();
const downloadSummaryCsvMock = vi.fn();
let canViewCommitteeMock = false;

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({
        canViewCommittee: canViewCommitteeMock,
        // The ICT Committee tab gates on authz.can('read','ict_committee');
        // these overview specs never exercise it, so it stays denied here.
        can: () => false,
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
        downloadSummaryCsv: (...args: unknown[]) => downloadSummaryCsvMock(...args),
    },
}));

vi.mock('@/components/dashboard/FilterBar', () => ({
    FilterBar: ({ canUseDepartmentFilter }: { canUseDepartmentFilter: boolean }) => (
        <div>{canUseDepartmentFilter ? 'department filter shown' : 'department filter hidden'}</div>
    ),
}));
vi.mock('@/components/dashboard/RiskDistributionMatrix', () => ({ RiskDistributionMatrix: () => <div>risk matrix</div> }));
vi.mock('@/components/dashboard/RiskDrilldownModal', () => ({ RiskDrilldownModal: () => null }));
vi.mock('@/components/dashboard/ControlTrendChart', () => ({ ControlTrendChart: () => <div>control trends</div> }));
vi.mock('@/components/dashboard/DepartmentTable', () => ({
    DepartmentTable: ({ canUseDepartmentFilter }: { canUseDepartmentFilter: boolean }) => (
        <div>{canUseDepartmentFilter ? 'department table focus enabled' : 'department table focus disabled'}</div>
    ),
}));
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
        return (
            <QueryClientProvider client={queryClient}>
                <DashboardFilterProvider>{children}</DashboardFilterProvider>
            </QueryClientProvider>
        );
    };
}

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>;
}

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, reject, resolve };
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
        expect(screen.getByText('department filter shown')).toBeInTheDocument();
        expect(screen.getByText('department table focus enabled')).toBeInTheDocument();
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
        await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
        expect(screen.queryByTitle('actions.export_summary_excel')).not.toBeInTheDocument();
        expect(screen.queryByText('issue summary')).not.toBeInTheDocument();
        expect(screen.getByText('department filter hidden')).toBeInTheDocument();
        expect(screen.getByText('department table focus disabled')).toBeInTheDocument();
    });

    it('hides the department filter when backend capability denies it', async () => {
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
            issue_summary: null,
            issue_aging: null,
            issue_severity: null,
            generated_at: '2026-03-07T10:00:00Z',
            capabilities: {
                can_read: true,
                can_view_issue_metrics: false,
                can_view_committee: false,
                can_view_vendor_metrics: false,
                can_use_department_filter: false,
                can_export_or_report: false,
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
        expect(screen.getByText('department filter hidden')).toBeInTheDocument();
        expect(screen.getByText('department table focus disabled')).toBeInTheDocument();
    });

    it('clears stale hidden department focus when backend capability denies filtering', async () => {
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
            issue_summary: null,
            issue_aging: null,
            issue_severity: null,
            generated_at: '2026-03-07T10:00:00Z',
            capabilities: {
                can_read: true,
                can_view_issue_metrics: false,
                can_view_committee: false,
                can_view_vendor_metrics: false,
                can_use_department_filter: false,
                can_export_or_report: false,
            },
        });

        render(
            <MemoryRouter initialEntries={['/?departmentId=10&viewMode=department']}>
                <DashboardPage />
                <LocationProbe />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(fetchOverviewMock).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/?viewMode=department'));
    });

    it('exports summary without hidden department focus when filtering is disallowed', async () => {
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
            issue_summary: null,
            issue_aging: null,
            issue_severity: null,
            generated_at: '2026-03-07T10:00:00Z',
            capabilities: {
                can_read: true,
                can_view_issue_metrics: false,
                can_view_committee: false,
                can_view_vendor_metrics: false,
                can_use_department_filter: false,
                can_export_or_report: true,
            },
        });

        render(
            <MemoryRouter initialEntries={['/?departmentId=10&viewMode=department']}>
                <DashboardPage />
                <LocationProbe />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(fetchOverviewMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/?viewMode=department'));
        fireEvent.click(await screen.findByTitle('actions.export_summary_excel'));

        expect(downloadSummaryCsvMock).toHaveBeenCalledWith({ departmentId: null });
    });

    it('announces a failed filtered export and retries the captured department without changing the URL', async () => {
        const firstExport = createDeferred<void>();
        downloadSummaryCsvMock
            .mockReturnValueOnce(firstExport.promise)
            .mockResolvedValueOnce(undefined);

        render(
            <MemoryRouter initialEntries={['/?departmentId=10&viewMode=department&source=audit#summary']}>
                <DashboardPage />
                <LocationProbe />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(fetchOverviewMock).toHaveBeenCalledTimes(1));
        const exportButton = await screen.findByTitle('actions.export_summary_excel');
        const initialUrl = screen.getByTestId('location').textContent;
        fireEvent.click(exportButton);

        expect(exportButton).toBeDisabled();
        await act(async () => {
            firstExport.reject(new Error('dashboard export unavailable'));
        });

        expect(await screen.findByRole('alert')).toHaveTextContent('export.errors.failed');
        expect(screen.getByTestId('location')).toHaveTextContent(initialUrl ?? '');

        fireEvent.click(screen.getByRole('button', { name: 'actions.retry' }));

        await waitFor(() => expect(downloadSummaryCsvMock).toHaveBeenCalledTimes(2));
        expect(downloadSummaryCsvMock).toHaveBeenNthCalledWith(1, { departmentId: 10 });
        expect(downloadSummaryCsvMock).toHaveBeenNthCalledWith(2, { departmentId: 10 });
        await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
        expect(screen.getByTestId('location')).toHaveTextContent(initialUrl ?? '');
    });
});
