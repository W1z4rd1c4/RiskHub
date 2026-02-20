import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { server } from '@test/mocks/server';
import { AuthProvider } from '@/contexts/AuthContext';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { ControlsPage } from '@/pages/ControlsPage';

const makeUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 123,
    email: 'test.user@riskhub.test',
    name: 'Test User',
    role: 'employee',
    role_display_name: 'Employee',
    permissions: [],
    effective_permissions: ['controls:read'],
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
                    <DashboardFilterProvider>
                        <Routes>
                            <Route path="/controls" element={<ControlsPage />} />
                        </Routes>
                    </DashboardFilterProvider>
                </AuthProvider>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('ControlsPage archived visibility', () => {
    beforeEach(() => {
        localStorage.setItem('access_token', 'test-token');
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('hides archived controls by default and shows them when status filter is set to Archived', async () => {
        const user = makeUser();

        const activeControl = {
            id: 1,
            name: 'Active Control',
            department_name: 'Operations',
            frequency: 'monthly',
            risk_level: 3,
            status: 'active',
            control_form: 'manual',
        };

        const archivedControl = {
            ...activeControl,
            id: 2,
            name: 'Archived Control',
            status: 'archived',
        };

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/controls', ({ request }) => {
                const url = new URL(request.url);
                const includeArchived = url.searchParams.get('include_archived') === 'true';
                const status = url.searchParams.get('status');
                const items = includeArchived || status === 'archived' ? [archivedControl] : [activeControl];
                return HttpResponse.json({
                    items,
                    total: items.length,
                    skip: Number(url.searchParams.get('skip') ?? 0),
                    limit: Number(url.searchParams.get('limit') ?? 20),
                });
            })
        );

        renderWithRoute('/controls');

        await screen.findByText('Active Control');
        expect(screen.queryByText('Archived Control')).not.toBeInTheDocument();

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('controls-status-filter-trigger'));
        await uiUser.click(screen.getByTestId('controls-status-filter-option-archived'));

        await screen.findByText('Archived Control');
    });
});

