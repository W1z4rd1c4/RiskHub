import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const getOverdueMock = vi.fn();
const getDueSoonMock = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/contexts/DashboardFilterContext', () => ({
    useDashboardFilters: () => ({
        filters: {
            departmentId: null,
        },
    }),
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getOverdue: (...args: unknown[]) => getOverdueMock(...args),
        getDueSoon: (...args: unknown[]) => getDueSoonMock(...args),
    },
}));

import { KRIStatusWidget } from '@/components/dashboard/KRIStatusWidget';

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}{location.search}</div>;
}

describe('KRIStatusWidget drilldown', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getOverdueMock.mockResolvedValue([
            {
                kri_id: 10,
                metric_name: 'Overdue KRI',
                frequency: 'quarterly',
                period_end: '2026-03-31',
                due_date: '2026-04-05',
                days_overdue: 3,
                risk_id: 7,
            },
        ]);
        getDueSoonMock.mockResolvedValue([
            {
                kri_id: 11,
                metric_name: 'Due Soon KRI',
                frequency: 'quarterly',
                period_end: '2026-03-31',
                due_date: '2026-04-05',
                days_until_due: 2,
                risk_id: 8,
            },
        ]);
    });

    it('routes the upcoming tab to the due-soon KRI list mode', async () => {
        render(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <>
                                <KRIStatusWidget />
                                <LocationProbe />
                            </>
                        }
                    />
                    <Route path="/kris" element={<LocationProbe />} />
                </Routes>
            </MemoryRouter>
        );

        await screen.findByText('Due Soon KRI');
        const ui = userEvent.setup();
        await ui.click(screen.getByText('kri.view_all'));

        await waitFor(() => {
            expect(screen.getByTestId('location')).toHaveTextContent('/kris?timeliness_status=due_soon');
        });
    });

    it('routes the overdue tab to the canonical not-submitted KRI filter', async () => {
        render(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <>
                                <KRIStatusWidget />
                                <LocationProbe />
                            </>
                        }
                    />
                    <Route path="/kris" element={<LocationProbe />} />
                </Routes>
            </MemoryRouter>
        );

        await screen.findByText('Due Soon KRI');
        const ui = userEvent.setup();
        await ui.click(screen.getByText('kri.overdue'));
        await screen.findByText('Overdue KRI');
        await ui.click(screen.getByText('kri.view_all_overdue'));

        await waitFor(() => {
            expect(screen.getByTestId('location')).toHaveTextContent('/kris?monitoring_status=not_submitted');
        });
    });
});
