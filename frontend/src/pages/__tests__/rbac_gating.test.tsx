import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { server } from '@/test/mocks/server';
import { AuthProvider } from '@/contexts/AuthContext';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';

import { KRIDetailPage } from '@/pages/KRIDetailPage';
import { ControlDetailPage } from '@/pages/ControlDetailPage';

type AuthMeUser = {
    id: number;
    email: string;
    name: string;
    role: string;
    role_display_name: string;
    permissions: string[];
    effective_permissions: string[];
    access_scope: 'global' | 'department' | 'manager';
    scope_label: string;
    department_id?: number;
    department_name?: string;
};

const makeUser = (overrides: Partial<AuthMeUser>): AuthMeUser => ({
    id: 123,
    email: 'test.user@riskhub.test',
    name: 'Test User',
    role: 'employee',
    role_display_name: 'Employee',
    permissions: [],
    effective_permissions: [],
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
                            <Route path="/kris/:id" element={<KRIDetailPage />} />
                            <Route path="/controls/:id" element={<ControlDetailPage />} />
                        </Routes>
                    </DashboardFilterProvider>
                </AuthProvider>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('RBAC UI gating', () => {
    beforeAll(() => server.listen());
    afterEach(() => server.resetHandlers());
    afterAll(() => server.close());

    beforeEach(() => {
        localStorage.setItem('access_token', 'test-token');
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('KRI: approvals:write only (not reporting owner) hides "Record Value"', async () => {
        const user = makeUser({
            id: 10,
            effective_permissions: ['approvals:write'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/kris/:id', () =>
                HttpResponse.json({
                    id: 1,
                    risk_id: 100,
                    metric_name: 'Mock KRI',
                    description: 'Mock',
                    current_value: 50,
                    lower_limit: 0,
                    upper_limit: 100,
                    unit: '%',
                    breach_status: 'within',
                    last_updated: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                    frequency: 'monthly',
                    reporting_owner_id: 999, // not the user
                })
            ),
            http.get('*/api/v1/risks/:id', () =>
                HttpResponse.json({
                    id: 100,
                    name: 'Mock Risk',
                    process: 'Mock Process',
                    description: 'Mock Desc',
                    category: 'Mock',
                    risk_type: 'operational',
                    risk_id_code: 'R-001',
                    net_score: 4,
                    gross_probability: 1,
                    gross_impact: 1,
                    net_probability: 1,
                    net_impact: 1,
                    status: 'active',
                    is_priority: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
            ),
            http.get('*/api/v1/kris/:id/history', () =>
                HttpResponse.json({ items: [], total: 0, page: 1, size: 50 })
            )
        );

        renderWithRoute('/kris/1');

        await screen.findByRole('heading', { name: 'Mock KRI' });
        expect(screen.queryByRole('button', { name: /record value/i })).not.toBeInTheDocument();
    });

    it('KRI: user with kri:submit (non-privileged) shows "Record Value"', async () => {
        const user = makeUser({
            id: 11,
            effective_permissions: ['kri:submit'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/kris/:id', () =>
                HttpResponse.json({
                    id: 1,
                    risk_id: 100,
                    metric_name: 'Mock KRI',
                    description: 'Mock',
                    current_value: 50,
                    lower_limit: 0,
                    upper_limit: 100,
                    unit: '%',
                    breach_status: 'within',
                    last_updated: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                    frequency: 'monthly',
                    reporting_owner_id: 999,
                })
            ),
            http.get('*/api/v1/risks/:id', () =>
                HttpResponse.json({
                    id: 100,
                    name: 'Mock Risk',
                    process: 'Mock Process',
                    description: 'Mock Desc',
                    category: 'Mock',
                    risk_type: 'operational',
                    risk_id_code: 'R-001',
                    net_score: 4,
                    gross_probability: 1,
                    gross_impact: 1,
                    net_probability: 1,
                    net_impact: 1,
                    status: 'active',
                    is_priority: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
            ),
            http.get('*/api/v1/kris/:id/history', () =>
                HttpResponse.json({ items: [], total: 0, page: 1, size: 50 })
            )
        );

        renderWithRoute('/kris/1');

        await screen.findByRole('heading', { name: 'Mock KRI' });
        expect(screen.getByRole('button', { name: /record value/i })).toBeInTheDocument();
    });

    it('KRI: reporting owner without kri:submit shows "Record Value"', async () => {
        const user = makeUser({
            id: 55,
            effective_permissions: ['approvals:write'], // explicitly not kri:submit
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/kris/:id', () =>
                HttpResponse.json({
                    id: 1,
                    risk_id: 100,
                    metric_name: 'Mock KRI',
                    description: 'Mock',
                    current_value: 50,
                    lower_limit: 0,
                    upper_limit: 100,
                    unit: '%',
                    breach_status: 'within',
                    last_updated: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                    frequency: 'monthly',
                    reporting_owner_id: 55, // user is reporting owner
                })
            ),
            http.get('*/api/v1/risks/:id', () =>
                HttpResponse.json({
                    id: 100,
                    name: 'Mock Risk',
                    process: 'Mock Process',
                    description: 'Mock Desc',
                    category: 'Mock',
                    risk_type: 'operational',
                    risk_id_code: 'R-001',
                    net_score: 4,
                    gross_probability: 1,
                    gross_impact: 1,
                    net_probability: 1,
                    net_impact: 1,
                    status: 'active',
                    is_priority: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
            ),
            http.get('*/api/v1/kris/:id/history', () =>
                HttpResponse.json({ items: [], total: 0, page: 1, size: 50 })
            )
        );

        renderWithRoute('/kris/1');

        await screen.findByRole('heading', { name: 'Mock KRI' });
        expect(screen.getByRole('button', { name: /record value/i })).toBeInTheDocument();
    });

    it('Controls: controls:write only hides "Log Execution"', async () => {
        const user = makeUser({
            id: 20,
            effective_permissions: ['controls:write'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/controls/:id', () =>
                HttpResponse.json({
                    id: 1,
                    name: 'Mock Control',
                    description: 'Mock',
                    control_form: 'manual',
                    frequency: 'monthly',
                    risk_level: 3,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    control_owner: { id: 20, name: 'Owner', email: 'owner@riskhub.test' },
                    department: { id: 1, name: 'Ops', code: 'OPS' },
                })
            ),
            http.get('*/api/v1/controls/:id/risks', () => HttpResponse.json([])),
            http.get('*/api/v1/controls/:id/executions', () => HttpResponse.json([]))
        );

        renderWithRoute('/controls/1');

        await screen.findByText('Mock Control');
        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByRole('button', { name: /execution history/i }));

        expect(await screen.findByText(/execution audit trail/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /log execution/i })).not.toBeInTheDocument();
    });

    it('Controls: controls:execute shows "Log Execution"', async () => {
        const user = makeUser({
            id: 21,
            effective_permissions: ['controls:execute'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/controls/:id', () =>
                HttpResponse.json({
                    id: 1,
                    name: 'Mock Control',
                    description: 'Mock',
                    control_form: 'manual',
                    frequency: 'monthly',
                    risk_level: 3,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    control_owner: { id: 21, name: 'Owner', email: 'owner@riskhub.test' },
                    department: { id: 1, name: 'Ops', code: 'OPS' },
                })
            ),
            http.get('*/api/v1/controls/:id/risks', () => HttpResponse.json([])),
            http.get('*/api/v1/controls/:id/executions', () => HttpResponse.json([]))
        );

        renderWithRoute('/controls/1');

        await screen.findByText('Mock Control');
        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByRole('button', { name: /execution history/i }));

        expect(await screen.findByText(/execution audit trail/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /log execution/i })).toBeInTheDocument();
    });
});
