import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDepartmentRegisterScope } from '@/pages/departments/useDepartmentRegisterScope';

const useDepartmentDetailMock = vi.fn();

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({
        canViewDepartmentAccess: false,
    }),
}));

vi.mock('@/hooks/useDepartmentDetail', () => ({
    useDepartmentDetail: (...args: unknown[]) => useDepartmentDetailMock(...args),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

function registerPage(name: string) {
    return function RegisterPage() {
        const scope = useDepartmentRegisterScope();
        return (
            <div data-testid={`${name}-register`}>
                {scope?.departmentId}:{scope?.departmentName}
            </div>
        );
    };
}

vi.mock('@/pages/RisksPage', () => ({ RisksPage: registerPage('risks') }));
vi.mock('@/pages/ControlsPage', () => ({ ControlsPage: registerPage('controls') }));
vi.mock('@/pages/KRIsPage', () => ({ KRIsPage: registerPage('kris') }));
vi.mock('@/pages/IssuesPage', () => ({ IssuesPage: registerPage('issues') }));
vi.mock('@/pages/ProcessesPage', () => ({ ProcessesPage: registerPage('processes') }));
vi.mock('@/pages/AssetsPage', () => ({ AssetsPage: registerPage('assets') }));
vi.mock('@/pages/VendorsPage', () => ({ VendorsPage: registerPage('vendors') }));
vi.mock('@/pages/UsersPage', () => ({ UsersPage: registerPage('users') }));
vi.mock('@/pages/ActivityLogPage', () => ({ ActivityLogPage: registerPage('activity') }));

import { DepartmentDetailPage } from '@/pages/DepartmentDetailPage';

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(initialEntry = '/departments/7?tab=assets&q=alpha&department_id=999') {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route path="/departments/:id" element={<DepartmentDetailPage />} />
            </Routes>
            <LocationProbe />
        </MemoryRouter>,
    );
}

describe('DepartmentDetailPage operational workspace', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useDepartmentDetailMock.mockReturnValue({
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
                kri_monitoring_counts: {},
                risk_distribution: { low: 1, medium: 1, high: 1, critical: 0 },
                risk_by_status: {},
                control_stats: { total: 2, active: 2, inactive: 0, by_form: {}, by_frequency: {} },
                recent_executions: [{
                    id: 44,
                    control_id: 123,
                    control_name: 'Quarterly access review',
                    result: 'passed',
                    executed_at: '2026-03-06T10:30:00Z',
                    executed_by: 'Alex Auditor',
                }],
                issue_count: 6,
                process_count: 7,
                asset_count: 8,
                vendor_count: 9,
                overdue_issue_count: 2,
                significant_vendor_count: 1,
            },
            isLoading: false,
            isAccessDenied: false,
            error: null,
            refresh: vi.fn(),
        });
    });

    it('renders exactly ten accessible tabs, never Threat, and opens the URL-selected canonical register', () => {
        renderPage();

        const tablist = screen.getByRole('tablist', { name: 'department_detail.tabs.label' });
        expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(10);
        expect(tablist).toHaveAttribute('data-testid', 'department-detail-tabs');
        expect(screen.getByRole('tab', { name: 'department_detail.tabs.overview' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'department_detail.tabs.assets' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByRole('tab', { name: /threat/i })).not.toBeInTheDocument();
        expect(screen.getByTestId('assets-register')).toHaveTextContent('7:Compliance');
        expect(useDepartmentDetailMock).toHaveBeenCalledWith(expect.objectContaining({
            activeTab: 'overview',
            canViewUsers: false,
        }));
    });

    it('keeps unrelated register state while changing tabs and keeps Users present when access is denied', async () => {
        const user = userEvent.setup();
        renderPage();

        await user.click(screen.getByRole('tab', { name: 'department_detail.tabs.users' }));

        expect(screen.getByTestId('users-register')).toHaveTextContent('7:Compliance');
        expect(screen.getByTestId('location')).toHaveTextContent(
            '/departments/7?tab=users&q=alpha&department_id=999',
        );

        await user.click(screen.getByRole('tab', { name: 'department_detail.tabs.activity' }));
        expect(screen.getByTestId('activity-register')).toHaveTextContent('7:Compliance');
    });

    it('renders the 4x2 overview cards and seeds canonical health filters', async () => {
        const user = userEvent.setup();
        renderPage('/departments/7?tab=overview');

        for (const key of ['risks', 'controls', 'kris', 'issues', 'processes', 'assets', 'vendors', 'users']) {
            expect(screen.getByTestId(`department-overview-card-${key}`)).toBeInTheDocument();
        }
        expect(screen.getByTestId('department-overview-activity')).toBeInTheDocument();
        expect(screen.getByText('Quarterly access review')).toBeInTheDocument();
        expect(screen.getByText(/Alex Auditor/)).toBeInTheDocument();
        expect(screen.getByText('passed')).toBeInTheDocument();

        await user.click(screen.getByTestId('department-overview-card-kris'));
        expect(screen.getByTestId('location')).toHaveTextContent(
            '/departments/7?tab=kris&filters=%7B%22monitoring_status%22%3A%22breach%22%7D',
        );
    });

    it('preserves recent-activity context and links to the canonical control detail', async () => {
        const user = userEvent.setup();
        renderPage('/departments/7?tab=overview');

        await user.click(screen.getByRole('button', { name: /Quarterly access review/ }));

        expect(screen.getByTestId('location')).toHaveTextContent('/controls/123');
    });
});
