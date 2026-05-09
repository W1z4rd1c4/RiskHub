import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useDepartmentDetailMock = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) => {
            if (typeof options?.count === 'number') {
                return `${key}:${options.count}`;
            }
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/hooks/useDepartmentDetail', () => ({
    useDepartmentDetail: (...args: unknown[]) => useDepartmentDetailMock(...args),
    DEPARTMENT_PAGE_SIZE: 100,
    HIGH_RISK_MIN_NET_SCORE: 10,
}));

import { DepartmentDetailPage } from '@/pages/DepartmentDetailPage';

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}</div>;
}

function renderDepartmentDetail({ includeLocationProbe = false }: { includeLocationProbe?: boolean } = {}) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/departments/7']}>
                <Routes>
                    <Route path="/departments/:id" element={<DepartmentDetailPage />} />
                </Routes>
                {includeLocationProbe ? <LocationProbe /> : null}
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('DepartmentDetailPage KRI monitoring integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useDepartmentDetailMock.mockImplementation((params: Record<string, unknown>) => ({
            department: {
                id: 7,
                name: 'Compliance',
                code: 'CMP',
                description: 'Monitoring department',
                created_at: '2026-03-01T00:00:00Z',
                updated_at: '2026-03-07T00:00:00Z',
                user_count: 4,
                risk_count: 3,
                high_risk_count: 1,
                control_count: 2,
                kri_count: 5,
                kri_monitoring_counts: {
                    new: 1,
                    not_submitted: 1,
                    breach: 2,
                    warning: 1,
                    optimal: 1,
                },
                risk_distribution: { low: 1, medium: 1, high: 1, critical: 0 },
                risk_by_status: {},
                control_stats: { total: 2, active: 2, inactive: 0, by_form: {}, by_frequency: {} },
                recent_executions: [],
            },
            isLoading: false,
            isAccessDenied: false,
            error: null,
            risks: [],
            controls: [],
            kris: params.kriFilter === 'breach'
                ? [
                    {
                        id: 13,
                        risk_id: 4,
                        metric_name: 'Breach KRI',
                        description: 'breach',
                        current_value: 130,
                        lower_limit: 0,
                        upper_limit: 100,
                        unit: '%',
                        breach_status: 'above',
                        monitoring_status: 'breach',
                        frequency: 'quarterly',
                    },
                ]
                : [
                    {
                        id: 12,
                        risk_id: 4,
                        metric_name: 'Warning KRI',
                        description: 'warning',
                        current_value: 95,
                        lower_limit: 0,
                        upper_limit: 100,
                        unit: '%',
                        breach_status: 'within',
                        monitoring_status: 'warning',
                        reporting_owner_name: 'Owner',
                        frequency: 'quarterly',
                    },
                ],
            users: [],
            riskTotalPages: 1,
            controlTotalPages: 1,
            kriTotalPages: 1,
            userTotalPages: 1,
            getRiskCount: () => 3,
            refresh: vi.fn(),
        }));
    });

    it('uses canonical monitoring badges and monitoring-driven filters', async () => {
        renderDepartmentDetail();

        const breachCard = screen.getByTitle('dashboard:kri_breaches');
        expect(within(breachCard).getByText('2')).toBeInTheDocument();

        const ui = userEvent.setup();
        await ui.click(screen.getByRole('button', { name: 'department_detail.tabs.kris:5' }));

        expect(screen.getAllByText('kris:monitoring.warning').length).toBeGreaterThan(0);
        expect(screen.queryByText('kris:columns.ok')).not.toBeInTheDocument();

        await ui.click(breachCard);
        expect(useDepartmentDetailMock).toHaveBeenLastCalledWith(expect.objectContaining({ kriFilter: 'breach' }));

        await ui.click(screen.getByRole('button', { name: 'kris:monitoring.warning' }));
        expect(useDepartmentDetailMock).toHaveBeenLastCalledWith(expect.objectContaining({ kriFilter: 'warning' }));
    });

    it('renders the backend-provided non-archived KRI total for the tab count', async () => {
        renderDepartmentDetail();

        expect(screen.getByRole('button', { name: 'department_detail.tabs.kris:5' })).toBeInTheDocument();
        expect(screen.queryByText('Department Archived Warning KRI')).not.toBeInTheDocument();
    });

    it('keeps department user rows informational instead of navigating away from the department page', async () => {
        useDepartmentDetailMock.mockImplementation(() => ({
            department: {
                id: 7,
                name: 'Compliance',
                code: 'CMP',
                description: 'Monitoring department',
                created_at: '2026-03-01T00:00:00Z',
                updated_at: '2026-03-07T00:00:00Z',
                user_count: 1,
                risk_count: 0,
                high_risk_count: 0,
                control_count: 0,
                kri_count: 0,
                kri_monitoring_counts: {
                    new: 0,
                    not_submitted: 0,
                    breach: 0,
                    warning: 0,
                    optimal: 0,
                },
                risk_distribution: { low: 0, medium: 0, high: 0, critical: 0 },
                risk_by_status: {},
                control_stats: { total: 0, active: 0, inactive: 0, by_form: {}, by_frequency: {} },
                recent_executions: [],
            },
            isLoading: false,
            isAccessDenied: false,
            error: null,
            risks: [],
            controls: [],
            kris: [],
            users: [
                {
                    id: 9,
                    name: 'Ops Analyst',
                    email: 'ops.analyst@riskhub.test',
                    role_name: 'employee',
                    department_id: 7,
                },
            ],
            riskTotalPages: 1,
            controlTotalPages: 1,
            kriTotalPages: 1,
            userTotalPages: 1,
            getRiskCount: () => 0,
            refresh: vi.fn(),
        }));

        renderDepartmentDetail({ includeLocationProbe: true });

        const ui = userEvent.setup();
        await ui.click(screen.getByRole('button', { name: 'department_detail.tabs.users:1' }));
        await ui.click(screen.getByText('Ops Analyst'));

        expect(screen.getByTestId('location')).toHaveTextContent('/departments/7');
    });

    it('renders denied instead of the department shell when detail access is forbidden', async () => {
        useDepartmentDetailMock.mockImplementation(() => ({
            department: null,
            isLoading: false,
            isAccessDenied: true,
            error: null,
            risks: [],
            controls: [],
            kris: [],
            users: [],
            riskTotalPages: 1,
            controlTotalPages: 1,
            kriTotalPages: 1,
            userTotalPages: 1,
            getRiskCount: () => 0,
            refresh: vi.fn(),
        }));

        renderDepartmentDetail();

        await screen.findByRole('heading', { name: /access denied|access.denied/i });
        expect(screen.queryByText('Compliance')).not.toBeInTheDocument();
    });
});
