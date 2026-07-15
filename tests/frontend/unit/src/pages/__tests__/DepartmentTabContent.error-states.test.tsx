import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Slice A (C4): a failed per-tab fetch must render an error + retry surface, NOT an
// empty department. Drives the REAL useDepartmentDetail hook with mocked APIs so the
// whole vertical slice (hook state model -> DepartmentTabContent -> SortableTable) is
// exercised. On the pre-fix code the failing fetch silently leaves the tab empty, so
// the `empty.*` message renders instead of an error — these tests fail (red) until the
// per-tab { isLoading, errorKey } state model is threaded through.

const departmentApiMock = vi.hoisted(() => ({
    getDepartment: vi.fn(),
    getDepartmentRisks: vi.fn(),
    getDepartmentControls: vi.fn(),
    getDepartmentKRIs: vi.fn(),
}));

const accessApiMock = vi.hoisted(() => ({
    listDepartmentAccessUsers: vi.fn(),
}));

vi.mock('@/services/departmentApi', () => ({ departmentApi: departmentApiMock }));
vi.mock('@/services/accessApi', () => ({ accessApi: accessApiMock }));
vi.mock('@/services/logger', () => ({ logError: vi.fn() }));
vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({ canViewDepartmentAccess: true }),
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskThresholds: () => ({
        thresholds: { critical: 16, high: 10, medium: 5 },
        getScoreColor: () => '',
        getMatrixCellColor: () => '',
        getScoreBadgeColor: () => '',
        isLoading: false,
        error: null,
    }),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) =>
            typeof options?.count === 'number' ? `${key}:${options.count}` : key,
        i18n: { language: 'en' },
    }),
}));

import { DepartmentDetailPage } from '@/pages/DepartmentDetailPage';

function departmentPayload() {
    return {
        id: 7,
        name: 'Compliance',
        code: 'CMP',
        description: '',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-07T00:00:00Z',
        user_count: 4,
        risk_count: 3,
        high_risk_count: 1,
        control_count: 2,
        kri_count: 5,
        kri_monitoring_counts: { new: 0, not_submitted: 0, breach: 0, warning: 0, optimal: 0 },
        risk_distribution: { low: 1, medium: 1, high: 1, critical: 0 },
        risk_by_status: {},
        control_stats: { total: 2, active: 2, inactive: 0, by_form: {}, by_frequency: {} },
        recent_executions: [],
    };
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/departments/7']}>
            <Routes>
                <Route path="/departments/:id" element={<DepartmentDetailPage />} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('Department tab fetch failures render an error + retry surface (C4)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        departmentApiMock.getDepartment.mockResolvedValue(departmentPayload());
        departmentApiMock.getDepartmentRisks.mockResolvedValue([]);
        departmentApiMock.getDepartmentControls.mockResolvedValue([]);
        departmentApiMock.getDepartmentKRIs.mockResolvedValue({ items: [], total: 0 });
        accessApiMock.listDepartmentAccessUsers.mockResolvedValue([]);
    });

    it('risks tab: a failed fetch shows the table error, not the empty message', async () => {
        departmentApiMock.getDepartmentRisks.mockRejectedValue(new Error('boom'));
        renderPage();

        expect(await screen.findByText('tables.error.message')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'tables.error.retry' })).toBeInTheDocument();
        expect(screen.queryByText('common:empty.no_risks_found')).not.toBeInTheDocument();
    });

    it('controls tab: a failed fetch shows the table error, not the empty message', async () => {
        departmentApiMock.getDepartmentControls.mockRejectedValue(new Error('boom'));
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole('button', { name: 'department_detail.tabs.controls:2' }));

        expect(await screen.findByText('tables.error.message')).toBeInTheDocument();
        expect(screen.queryByText('common:empty.no_controls_department')).not.toBeInTheDocument();
    });

    it('kris tab: a failed fetch shows the table error, not the empty message', async () => {
        departmentApiMock.getDepartmentKRIs.mockRejectedValue(new Error('boom'));
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole('button', { name: 'department_detail.tabs.kris:5' }));

        expect(await screen.findByText('tables.error.message')).toBeInTheDocument();
        expect(screen.queryByText('common:empty.no_kris_department')).not.toBeInTheDocument();
    });

    it('users tab: a failed fetch shows the table error, not the empty message', async () => {
        accessApiMock.listDepartmentAccessUsers.mockRejectedValue(new Error('boom'));
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole('button', { name: 'department_detail.tabs.users:4' }));

        expect(await screen.findByText('tables.error.message')).toBeInTheDocument();
        expect(screen.queryByText('common:empty.no_users_department')).not.toBeInTheDocument();
    });

    it('users tab uses the scoped access roster and projects minimal display fields', async () => {
        accessApiMock.listDepartmentAccessUsers.mockResolvedValue([{
            id: 14,
            name: 'Department Owner',
            email: 'owner@example.com',
            department_id: 7,
            role: { name: 'department_head' },
        }]);
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole('button', { name: 'department_detail.tabs.users:4' }));

        expect(await screen.findByText('Department Owner')).toBeInTheDocument();
        expect(screen.getByText('owner@example.com')).toBeInTheDocument();
        expect(accessApiMock.listDepartmentAccessUsers).toHaveBeenCalledWith(7);
    });

    it('retry re-runs the failed tab fetch and recovers to data', async () => {
        departmentApiMock.getDepartmentRisks
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce([
                {
                    id: 41,
                    risk_id_code: 'R-41',
                    name: 'Recovered Risk',
                    process: 'Ops',
                    risk_type: 'operational',
                    description: 'desc',
                    gross_score: 6,
                    gross_probability: 2,
                    gross_impact: 3,
                    net_score: 4,
                    status: 'active',
                    is_archived: false,
                    is_priority: false,
                },
            ]);
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole('button', { name: 'tables.error.retry' }));

        expect(await screen.findByText('Recovered Risk')).toBeInTheDocument();
        expect(screen.queryByText('tables.error.message')).not.toBeInTheDocument();
    });
});

// R3a: the department detail hook retains the four tab arrays across a departmentId
// change (the route element is stable, so the hook never remounts). If B's metadata
// resolves first, B's header must not render above A's rows; and if B's tab fetch is
// pending or fails, the user must see loading / empty / error — never A's stale rows
// under B's identity. These drive the REAL hook via the page across an A->B route
// change; both are red on the pre-fix code (tab arrays are not scoped to departmentId).

function NavToDepartmentB() {
    const navigate = useNavigate();
    return (
        <button type="button" data-testid="nav-to-b" onClick={() => navigate('/departments/8')}>
            go-b
        </button>
    );
}

function renderPageForScoping() {
    return render(
        <MemoryRouter initialEntries={['/departments/7']}>
            <NavToDepartmentB />
            <Routes>
                <Route path="/departments/:id" element={<DepartmentDetailPage />} />
            </Routes>
        </MemoryRouter>,
    );
}

function scopedDeptPayload(id: number, name: string) {
    return { ...departmentPayload(), id, name, code: `D${id}` };
}

const ALPHA_DEPT_RISK = {
    id: 41,
    risk_id_code: 'R-41',
    name: 'Alpha-Dept-Risk',
    process: 'Ops',
    risk_type: 'operational',
    description: 'desc',
    gross_score: 6,
    gross_probability: 2,
    gross_impact: 3,
    net_score: 4,
    status: 'active',
    is_archived: false,
    is_priority: false,
};

describe('Department tab data is scoped to departmentId across an A->B route change (R3a)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        departmentApiMock.getDepartment.mockImplementation((id: number) =>
            Promise.resolve(scopedDeptPayload(id, id === 8 ? 'Beta Dept' : 'Alpha Dept')),
        );
        departmentApiMock.getDepartmentControls.mockResolvedValue([]);
        departmentApiMock.getDepartmentKRIs.mockResolvedValue({ items: [], total: 0 });
        accessApiMock.listDepartmentAccessUsers.mockResolvedValue([]);
    });

    it('does not show department A rows under department B while B risks are still pending', async () => {
        departmentApiMock.getDepartmentRisks.mockImplementation((id: number) =>
            id === 8 ? new Promise<never>(() => {}) : Promise.resolve([ALPHA_DEPT_RISK]),
        );
        const user = userEvent.setup();
        renderPageForScoping();

        // Department A loaded with its own risk row.
        expect(await screen.findByText('Alpha-Dept-Risk')).toBeInTheDocument();

        await user.click(screen.getByTestId('nav-to-b'));

        // B's header renders once B metadata resolves…
        expect(await screen.findByText('Beta Dept')).toBeInTheDocument();
        // …but A's row must NOT persist under B (B risks pending -> loading/empty).
        expect(screen.queryByText('Alpha-Dept-Risk')).not.toBeInTheDocument();
    });

    it('shows an error/retry surface (not A rows) when department B risks fetch fails', async () => {
        departmentApiMock.getDepartmentRisks.mockImplementation((id: number) =>
            id === 8 ? Promise.reject(new Error('boom')) : Promise.resolve([ALPHA_DEPT_RISK]),
        );
        const user = userEvent.setup();
        renderPageForScoping();

        expect(await screen.findByText('Alpha-Dept-Risk')).toBeInTheDocument();

        await user.click(screen.getByTestId('nav-to-b'));

        expect(await screen.findByText('Beta Dept')).toBeInTheDocument();
        // A failed B fetch surfaces the table error, not department A's stale rows.
        expect(await screen.findByText('tables.error.message')).toBeInTheDocument();
        expect(screen.queryByText('Alpha-Dept-Risk')).not.toBeInTheDocument();
    });
});
