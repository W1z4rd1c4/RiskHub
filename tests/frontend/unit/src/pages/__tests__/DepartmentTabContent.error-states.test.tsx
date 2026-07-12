import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

const userApiMock = vi.hoisted(() => ({
    listVisibleUsers: vi.fn(),
}));

vi.mock('@/services/departmentApi', () => ({ departmentApi: departmentApiMock }));
vi.mock('@/services/userApi', () => ({ userApi: userApiMock }));
vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

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
        userApiMock.listVisibleUsers.mockResolvedValue([]);
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
        userApiMock.listVisibleUsers.mockRejectedValue(new Error('boom'));
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole('button', { name: 'department_detail.tabs.users:4' }));

        expect(await screen.findByText('tables.error.message')).toBeInTheDocument();
        expect(screen.queryByText('common:empty.no_users_department')).not.toBeInTheDocument();
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
