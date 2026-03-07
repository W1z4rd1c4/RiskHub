import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { server } from '@test/mocks/server';
import { clearAccessToken, setAccessToken } from '@/services/accessTokenStore';
import { clearBootstrapSession } from '@/services/authSessionCoordinator';
import { AuthProvider } from '@/contexts/AuthContext';
import { KRIsPage } from '@/pages/KRIsPage';

const makeUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 123,
    email: 'test.user@riskhub.test',
    name: 'Test User',
    role: 'employee',
    role_display_name: 'Employee',
    permissions: [],
    effective_permissions: ['risks:read'],
    access_scope: 'department',
    scope_label: 'dept',
    ...overrides,
});

function renderWithRoute(route: string) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[route]}>
                <AuthProvider>
                    <Routes>
                        <Route path="/kris" element={<KRIsPage />} />
                    </Routes>
                </AuthProvider>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('KRIsPage monitoring status filters', () => {
    beforeEach(() => {
        clearBootstrapSession();
        setAccessToken('test-token');
    });

    afterEach(() => {
        clearAccessToken();
        clearBootstrapSession();
    });

    it('requests warning KRIs via monitoring_status and renders the canonical badge', async () => {
        const user = makeUser();
        const warningKri = {
            id: 21,
            risk_id: 8,
            metric_name: 'Warning KRI',
            description: 'Warning metric',
            current_value: 95,
            lower_limit: 0,
            upper_limit: 100,
            unit: 'count',
            breach_status: 'within',
            monitoring_status: 'warning',
            last_updated: '2026-03-01T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
            frequency: 'quarterly',
        };
        const optimalKri = {
            ...warningKri,
            id: 22,
            metric_name: 'Optimal KRI',
            monitoring_status: 'optimal',
            current_value: 55,
        };

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/kris', ({ request }) => {
                const url = new URL(request.url);
                const monitoringStatus = url.searchParams.get('monitoring_status');
                const items = monitoringStatus === 'warning' ? [warningKri] : [optimalKri];
                return HttpResponse.json({
                    items,
                    total: items.length,
                    page: Number(url.searchParams.get('page') ?? 1),
                    size: Number(url.searchParams.get('size') ?? 20),
                });
            })
        );

        renderWithRoute('/kris');

        await screen.findByText('Optimal KRI');

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('kris-status-filter-warning'));

        await screen.findByText('Warning KRI');
        expect(screen.queryByText('Optimal KRI')).not.toBeInTheDocument();
        expect(screen.getAllByText('Warning').length).toBeGreaterThan(0);
    });

    it('initializes due-soon mode from the route and requests timeliness_status', async () => {
        const user = makeUser();
        const dueSoonKri = {
            id: 31,
            risk_id: 9,
            metric_name: 'Due Soon KRI',
            description: 'Due soon metric',
            current_value: 45,
            lower_limit: 0,
            upper_limit: 100,
            unit: 'count',
            breach_status: 'within',
            monitoring_status: 'optimal',
            last_updated: '2026-03-01T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
            frequency: 'quarterly',
        };
        const fallbackKri = {
            ...dueSoonKri,
            id: 32,
            metric_name: 'Fallback KRI',
        };

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/kris', ({ request }) => {
                const url = new URL(request.url);
                const timelinessStatus = url.searchParams.get('timeliness_status');
                const items = timelinessStatus === 'due_soon' ? [dueSoonKri] : [fallbackKri];
                return HttpResponse.json({
                    items,
                    total: items.length,
                    page: Number(url.searchParams.get('page') ?? 1),
                    size: Number(url.searchParams.get('size') ?? 20),
                });
            })
        );

        renderWithRoute('/kris?timeliness_status=due_soon');

        await screen.findByText('Due Soon KRI');
        expect(screen.queryByText('Fallback KRI')).not.toBeInTheDocument();
    });
});
