import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
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
                attention_control_count: 1,
                kri_count: 5,
                kri_monitoring_counts: { breach: 1, not_submitted: 2 },
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
                open_issue_count: 4,
                process_count: 7,
                critical_process_count: 2,
                cif_process_count: 1,
                asset_count: 8,
                critical_asset_count: 3,
                legacy_asset_count: 2,
                vendor_count: 9,
                critical_vendor_count: 2,
                dora_vendor_count: 3,
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

    it('renders the 4x2 overview cards and full-width recent activity', () => {
        renderPage('/departments/7?tab=overview');

        for (const key of ['risks', 'controls', 'kris', 'issues', 'processes', 'assets', 'vendors', 'users']) {
            expect(screen.getByTestId(`department-overview-card-${key}`)).toBeInTheDocument();
        }
        expect(screen.getByTestId('department-overview-activity')).toBeInTheDocument();
        expect(screen.getByText('Quarterly access review')).toBeInTheDocument();
        expect(screen.getByText(/Alex Auditor/)).toBeInTheDocument();
        expect(screen.getByText('passed')).toBeInTheDocument();

    });

    it('opens the whole KRI card unfiltered while preserving the immutable Department scope', async () => {
        const user = userEvent.setup();
        renderPage('/departments/7?tab=overview&q=capital&page=4&group=warning&filters=%7B%22monitoring_status%22%3A%22warning%22%7D');

        const card = screen.getByTestId('department-overview-card-kris');
        await user.click(within(card).getByRole('button', { name: 'department_detail.tabs.kris 5' }));

        expect(screen.getByTestId('location')).toHaveTextContent(
            '/departments/7?tab=kris&q=capital',
        );
        expect(screen.getByTestId('kris-register')).toHaveTextContent('7:Compliance');
    });

    it('writes every health action to its canonical URL filter without weakening Department scope', async () => {
        const user = userEvent.setup();
        renderPage('/departments/7?tab=overview&q=capital&page=4&group=warning');

        const actions = [
            ['risks', 'department_detail.health.high_risks', { net_band: 'Vysoké' }],
            ['risks', 'department_detail.health.critical_risks', { net_band: 'Kritické' }],
            ['controls', 'department_detail.health.attention_controls', { monitoring_status: 'needs_review' }],
            ['kris', 'department_detail.health.kri_breaches', { monitoring_status: 'breach' }],
            ['kris', 'department_detail.health.kri_overdue', { monitoring_status: 'not_submitted' }],
            ['issues', 'department_detail.health.open_issues', { status: 'open' }],
            ['issues', 'department_detail.health.overdue_issues', { overdue: true }],
            ['processes', 'department_detail.health.critical_processes', { criticality: ['critical'] }],
            ['processes', 'department_detail.health.cif_processes', { cif: true }],
            ['assets', 'department_detail.health.critical_assets', { criticality: ['critical'] }],
            ['assets', 'department_detail.health.legacy_assets', { legacy: true }],
            ['vendors', 'department_detail.health.critical_vendors', { tiers: ['critical'] }],
            ['vendors', 'department_detail.health.dora_vendors', { dora_relevant: true }],
            ['users', 'department_detail.health.active_users', undefined],
        ] as const;

        for (const [tab, label, filters] of actions) {
            const card = screen.getByTestId(`department-overview-card-${tab}`);
            await user.click(
                within(card).getByRole('button', {
                    name: `department_detail.tabs.${tab} ${label}`,
                }),
            );
            const encodedFilters = filters
                ? `&filters=${encodeURIComponent(JSON.stringify(filters))}`
                : '';
            expect(screen.getByTestId('location')).toHaveTextContent(
                `/departments/7?tab=${tab}&q=capital${encodedFilters}`,
            );
            expect(screen.getByTestId(`${tab}-register`)).toHaveTextContent('7:Compliance');
            await user.click(screen.getByRole('tab', { name: 'department_detail.tabs.overview' }));
        }
    });

    it('preserves recent-activity context and links to the canonical control detail', async () => {
        const user = userEvent.setup();
        renderPage('/departments/7?tab=overview');

        await user.click(screen.getByRole('button', { name: /Quarterly access review/ }));

        expect(screen.getByTestId('location')).toHaveTextContent('/controls/123');
    });
});
