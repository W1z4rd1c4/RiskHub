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

        const expander = screen.getByRole('button', { name: 'dashboard:filters.title' });
        expect(expander).toHaveAttribute('aria-expanded', 'false');
        await user.click(expander);
        expect(expander).toHaveAttribute('aria-expanded', 'true');
        const highToggle = screen.getByRole('button', { name: 'dashboard:risk_levels.high' });
        expect(highToggle).toHaveAttribute('aria-pressed', 'false');
        await user.click(highToggle);
        expect(highToggle).toHaveAttribute('aria-pressed', 'true');

        expect(screen.getByTestId('dashboard-filter-scope-note')).toHaveTextContent(
            'dashboard:filters.unaffected_scope',
        );
        expect(screen.getByRole('button', {
            name: 'Remove dashboard:filters.risk_level: dashboard:risk_levels.high',
        })).toBeInTheDocument();
    });
});
