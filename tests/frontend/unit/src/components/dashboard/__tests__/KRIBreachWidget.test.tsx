import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBreachesMock = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { shown?: number; total?: number }) => (
            key === 'kri.showing' && options
                ? `Showing ${options.shown} of ${options.total}`
                : key
        ),
    }),
}));

vi.mock('@/contexts/DashboardFilterContext', () => ({
    useDashboardFilterSelector: (
        selector: (state: { filters: { departmentId: number | null } }) => unknown,
    ) => selector({ filters: { departmentId: null } }),
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getBreaches: (...args: unknown[]) => getBreachesMock(...args),
    },
}));

vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

import { KRIBreachWidget } from '@/components/dashboard/KRIBreachWidget';

describe('KRIBreachWidget population count', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getBreachesMock.mockResolvedValue(
            Array.from({ length: 6 }, (_, index) => ({
                id: index + 1,
                risk_id: index + 10,
                metric_name: `Breach ${index + 1}`,
                current_value: 120,
                upper_limit: 100,
                unit: '%',
            })),
        );
    });

    it('keeps the exact breach total while showing only the first five', async () => {
        render(
            <MemoryRouter>
                <KRIBreachWidget />
            </MemoryRouter>,
        );

        expect(await screen.findByText('Showing 5 of 6')).toBeInTheDocument();
        expect(screen.getByTestId('kri-breach-total')).toHaveTextContent('6');
        expect(screen.getByText('Breach 5')).toBeInTheDocument();
        expect(screen.queryByText('Breach 6')).not.toBeInTheDocument();
    });
});
