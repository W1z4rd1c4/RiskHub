import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBreachesMock = vi.fn();
const getOverdueMock = vi.fn();
const getDueSoonMock = vi.fn();
const getDepartmentsMock = vi.fn();

vi.mock('@/i18n/hooks', () => {
    const t = (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key);
    return {
        useTranslation: () => ({
            t,
            i18n: { language: 'en' },
        }),
    };
});

vi.mock('@/contexts/DashboardFilterContext', () => {
    const state = {
        filters: {
            departmentId: null,
            riskLevel: 'all',
            controlStatus: null,
            controlForm: null,
        },
        hasActiveFilters: false,
    };

    return {
        useDashboardFilters: () => state,
        useDashboardFilterSelector: (selector: (value: typeof state) => unknown) => selector(state),
        useDashboardFilterMutators: () => ({
            setDepartmentId: vi.fn(),
            setRiskLevel: vi.fn(),
            setControlStatus: vi.fn(),
            setControlForm: vi.fn(),
            resetFilters: vi.fn(),
        }),
    };
});

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getBreaches: (...args: unknown[]) => getBreachesMock(...args),
        getOverdue: (...args: unknown[]) => getOverdueMock(...args),
        getDueSoon: (...args: unknown[]) => getDueSoonMock(...args),
    },
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getDepartments: (...args: unknown[]) => getDepartmentsMock(...args),
    },
}));

vi.mock('@/services/logger', () => ({
    logError: vi.fn(),
}));

import { FilterBar } from '@/components/dashboard/FilterBar';
import { KRIBreachWidget } from '@/components/dashboard/KRIBreachWidget';
import { KRIStatusWidget } from '@/components/dashboard/KRIStatusWidget';

describe('dashboard widget error states', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getBreachesMock.mockResolvedValue([]);
        getOverdueMock.mockResolvedValue([]);
        getDueSoonMock.mockResolvedValue([]);
        getDepartmentsMock.mockResolvedValue([]);
    });

    it('shows a WidgetShell error when breach fetch fails', async () => {
        getBreachesMock.mockRejectedValue(new Error('breach api unavailable'));

        render(
            <MemoryRouter>
                <KRIBreachWidget />
            </MemoryRouter>,
        );

        expect(await screen.findByTestId('widget-error')).toHaveTextContent('breach api unavailable');
    });

    it('shows a WidgetShell error when status fetch fails', async () => {
        getOverdueMock.mockRejectedValue(new Error('status api unavailable'));

        render(
            <MemoryRouter>
                <KRIStatusWidget />
            </MemoryRouter>,
        );

        expect(await screen.findByTestId('widget-error')).toHaveTextContent('status api unavailable');
    });

    it('shows a non-blocking department filter error when departments cannot load', async () => {
        getDepartmentsMock.mockRejectedValue(new Error('department api unavailable'));

        render(<FilterBar canUseDepartmentFilter />);

        await waitFor(() => expect(getDepartmentsMock).toHaveBeenCalled());
        await userEvent.click(screen.getByRole('button', { name: /dashboard:filters.title/i }));

        expect(await screen.findByTestId('department-filter-error')).toHaveTextContent('Departments unavailable');
        expect(screen.getByText('dashboard:filters.risk_level')).toBeInTheDocument();
    });
});
