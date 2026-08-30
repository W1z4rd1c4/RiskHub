import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    DashboardFilterProvider,
    useDashboardFilterMutators,
    useDashboardFilterSelector,
} from '@/contexts/DashboardFilterContext';
import { DashboardPage } from '@/pages/DashboardPage';
import { createTestQueryClient } from '@test/queryClient';

const fetchOverviewMock = vi.fn();

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({
        canViewCommittee: false,
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
    },
}));

vi.mock('@/pages/dashboard/DashboardOverviewContent', () => ({
    DashboardOverviewContent: () => <div>dashboard overview content</div>,
}));

vi.mock('@/components/dashboard/RiskCommitteeSection', () => ({ RiskCommitteeSection: () => null }));
vi.mock('@/components/dashboard/IctCommitteeSection', () => ({ IctCommitteeSection: () => null }));

function LocationProbe() {
    const location = useLocation();
    const navigate = useNavigate();
    return (
        <div>
            <output data-testid="location">{location.pathname}{location.search}</output>
            <button type="button" onClick={() => navigate(-1)}>history back</button>
            <button type="button" onClick={() => navigate(1)}>history forward</button>
        </div>
    );
}

function DashboardControls() {
    const snapshot = useDashboardFilterSelector((state) => state);
    const {
        resetFilters,
        setControlForm,
        setControlStatus,
        setDepartmentId,
        setRiskLevel,
    } = useDashboardFilterMutators();

    return (
        <div>
            <output data-testid="filters">
                {snapshot.filters.departmentId ?? 'none'}|{snapshot.filters.riskLevel}|
                {snapshot.filters.controlStatus ?? 'none'}|{snapshot.filters.controlForm ?? 'none'}|
                {snapshot.viewMode}
            </output>
            <button type="button" onClick={() => setRiskLevel('high')}>risk high</button>
            <button type="button" onClick={() => setControlStatus('active')}>status active</button>
            <button type="button" onClick={() => setControlForm('preventive')}>form preventive</button>
            <button type="button" onClick={() => setDepartmentId(10)}>department ten</button>
            <button type="button" onClick={() => setDepartmentId(null)}>clear department</button>
            <button type="button" onClick={resetFilters}>reset dashboard</button>
        </div>
    );
}

function dashboardResponse(canUseDepartmentFilter = true) {
    return {
        summary: {
            total_controls: 0,
            controls_by_status: {},
            controls_by_form: {},
            controls_by_frequency: {},
            total_risks: 0,
            risks_by_status: {},
            critical_risks_count: 0,
            average_net_risk_score: 0,
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
        generated_at: '2026-08-30T00:00:00Z',
        capabilities: {
            can_read: true,
            can_view_issue_metrics: false,
            can_view_committee: false,
            can_view_vendor_metrics: false,
            can_use_department_filter: canUseDepartmentFilter,
            can_export_or_report: false,
        },
    };
}

function renderDashboard(initialEntries: string[], initialIndex = initialEntries.length - 1) {
    const queryClient = createTestQueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
                <DashboardFilterProvider>
                    <LocationProbe />
                    <DashboardControls />
                    <Routes>
                        <Route path="/" element={<DashboardPage />} />
                        <Route path="/previous" element={<div>previous page</div>} />
                    </Routes>
                </DashboardFilterProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe('Dashboard URL state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchOverviewMock.mockResolvedValue(dashboardResponse());
    });

    it('uses the five route-owned filter values for the first overview request', async () => {
        renderDashboard([
            '/?source=review&view=overview&departmentId=7&riskLevel=high&controlStatus=active&controlForm=preventive&viewMode=department',
        ]);

        await waitFor(() => expect(fetchOverviewMock).toHaveBeenCalled());
        expect(fetchOverviewMock).toHaveBeenNthCalledWith(1, {
            departmentId: 7,
            riskLevel: 'high',
            controlStatus: 'active',
            controlForm: 'preventive',
        }, expect.any(Object));
        expect(screen.getByTestId('filters')).toHaveTextContent('7|high|active|preventive|department');
        expect(screen.getByTestId('location').textContent).toBe(
            '/?source=review&view=overview&departmentId=7&riskLevel=high&controlStatus=active&controlForm=preventive&viewMode=department',
        );
    });

    it('normalizes invalid/default values with replace and preserves committee and unrelated parameters', async () => {
        renderDashboard([
            '/previous',
            '/?source=review&view=overview&departmentId=-1&riskLevel=all&controlStatus=wat&controlForm=wat&viewMode=wat',
        ]);

        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe('/?source=review&view=overview');
        });

        fireEvent.click(screen.getByRole('button', { name: 'history back' }));
        expect(await screen.findByText('previous page')).toBeInTheDocument();
    });

    it('pushes atomic discrete choices and restores the prior request state with Back', async () => {
        renderDashboard(['/?source=review&view=overview']);
        await waitFor(() => expect(fetchOverviewMock).toHaveBeenCalled());

        fireEvent.click(screen.getByRole('button', { name: 'risk high' }));
        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe(
                '/?source=review&view=overview&riskLevel=high',
            );
        });

        fireEvent.click(screen.getByRole('button', { name: 'department ten' }));
        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe(
                '/?source=review&view=overview&departmentId=10&riskLevel=high&viewMode=department',
            );
        });
        expect(screen.getByTestId('filters')).toHaveTextContent('10|high|none|none|department');

        fireEvent.click(screen.getByRole('button', { name: 'history back' }));
        await waitFor(() => expect(screen.getByTestId('filters')).toHaveTextContent('none|high|none|none|executive'));
        expect(screen.getByTestId('location').textContent).toBe('/?source=review&view=overview&riskLevel=high');
        await waitFor(() => {
            expect(fetchOverviewMock).toHaveBeenLastCalledWith({
                departmentId: null,
                riskLevel: 'high',
                controlStatus: null,
                controlForm: null,
            }, expect.any(Object));
        });

        fireEvent.click(screen.getByRole('button', { name: 'history forward' }));
        await waitFor(() => {
            expect(screen.getByTestId('filters')).toHaveTextContent('10|high|none|none|department');
        });
    });

    it('keeps a valid viewMode when department focus is cleared', async () => {
        renderDashboard(['/?source=review&departmentId=10&viewMode=department']);
        await waitFor(() => expect(screen.getByTestId('filters')).toHaveTextContent('10|all|none|none|department'));

        fireEvent.click(screen.getByRole('button', { name: 'clear department' }));

        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe('/?source=review&viewMode=department');
            expect(screen.getByTestId('filters')).toHaveTextContent('none|all|none|none|department');
        });
    });

    it('pushes one atomic reset and Back restores every prior filter', async () => {
        renderDashboard([
            '/?source=review&view=overview&departmentId=10&riskLevel=high&controlStatus=active&controlForm=preventive&viewMode=department',
        ]);
        await waitFor(() => expect(screen.getByTestId('filters')).toHaveTextContent('10|high|active|preventive|department'));

        fireEvent.click(screen.getByRole('button', { name: 'reset dashboard' }));
        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe('/?source=review&view=overview');
            expect(screen.getByTestId('filters')).toHaveTextContent('none|all|none|none|executive');
        });

        fireEvent.click(screen.getByRole('button', { name: 'history back' }));
        await waitFor(() => {
            expect(screen.getByTestId('filters')).toHaveTextContent('10|high|active|preventive|department');
        });
    });

    it('removes only denied department focus with replace', async () => {
        fetchOverviewMock.mockResolvedValue(dashboardResponse(false));
        renderDashboard([
            '/previous',
            '/?source=review&view=overview&departmentId=10&riskLevel=high&viewMode=department',
        ]);

        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe(
                '/?source=review&view=overview&riskLevel=high&viewMode=department',
            );
        });
        expect(screen.getByTestId('filters')).toHaveTextContent('none|high|none|none|department');

        fireEvent.click(screen.getByRole('button', { name: 'history back' }));
        expect(await screen.findByText('previous page')).toBeInTheDocument();
    });
});
