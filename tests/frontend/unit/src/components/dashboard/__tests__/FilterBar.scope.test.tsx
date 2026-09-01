import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';

const getDepartmentsMock = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { label?: string }) => (
            key === 'dashboard:filters.remove' ? `Remove ${options?.label}` : key
        ),
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getDepartments: (...args: unknown[]) => getDepartmentsMock(...args),
    },
}));

import { FilterBar } from '@/components/dashboard/FilterBar';

describe('FilterBar population scope', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDepartmentsMock.mockResolvedValue([]);
    });

    it('states which panels remain unfiltered when a risk filter is active', async () => {
        const user = userEvent.setup();
        render(
            <DashboardFilterProvider>
                <FilterBar
                    canUseDepartmentFilter
                    filterScope={{
                        department_applies_to_all_scoped_panels: true,
                        risk_level_applies_to: [],
                        control_filters_apply_to: [],
                        unaffected_by_risk_control: ['kri', 'issues', 'vendors'],
                    }}
                />
            </DashboardFilterProvider>,
        );

        await user.click(screen.getByRole('button', { name: 'dashboard:filters.title' }));
        await user.click(screen.getByRole('button', { name: 'dashboard:issues.severity.high' }));

        expect(screen.getByTestId('dashboard-filter-scope-note')).toHaveTextContent(
            'dashboard:filters.unaffected_scope',
        );
        expect(screen.getByRole('button', {
            name: 'Remove dashboard:filters.risk_level: dashboard:issues.severity.high',
        })).toBeInTheDocument();
    });
});
