import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { server } from '@test/mocks/server';
import { clearAccessToken, setAccessToken } from '@/services/accessTokenStore';
import { AuthProvider } from '@/contexts/AuthContext';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { buildAuthz } from '@/authz/policy';

import { KRIDetailPage } from '@/pages/KRIDetailPage';
import { ControlDetailPage } from '@/pages/ControlDetailPage';
import { ControlsPage } from '@/pages/ControlsPage';
import { RisksPage } from '@/pages/RisksPage';
import { UsersPage } from '@/pages/UsersPage';

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

type AccessUserApi = {
    id: number;
    email: string;
    name: string;
    is_active: boolean;
    role_id: number;
    role: {
        id: number;
        name: string;
        display_name: string;
        description: string;
    };
    department_id: number | null;
    department_name: string | null;
    manager_id: number | null;
    manager_name: string | null;
    access_scope: 'global' | 'department' | 'manager';
    scope_label: string;
    effective_permissions: string[];
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

function makeHasPermission(perms: string[]) {
    return (resource: string, action: string) =>
        perms.some((perm) => {
            const [permResource, permAction] = perm.split(':');
            return (permResource === '*' || permResource === resource) &&
                (permAction === '*' || permAction === action);
        });
}

const makeAccessUser = (overrides: Partial<AccessUserApi> = {}): AccessUserApi => ({
    id: 200,
    email: 'employee.one@riskhub.test',
    name: 'Employee One',
    is_active: true,
    role_id: 2,
    role: {
        id: 2,
        name: 'employee',
        display_name: 'Employee',
        description: 'Standard employee',
    },
    department_id: 10,
    department_name: 'Operations',
    manager_id: null,
    manager_name: null,
    access_scope: 'department',
    scope_label: 'Department',
    effective_permissions: ['risks:read'],
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
                            <Route path="/controls" element={<ControlsPage />} />
                            <Route path="/controls/:id" element={<ControlDetailPage />} />
                            <Route path="/risks" element={<RisksPage />} />
                            <Route path="/users" element={<UsersPage />} />
                        </Routes>
                    </DashboardFilterProvider>
                </AuthProvider>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('RBAC UI gating', () => {
    beforeEach(() => {
        setAccessToken('test-token');
    });

    afterEach(() => {
        clearAccessToken();
    });

    it('Authz policy: derives capabilities only from permissions + explicit role gates', () => {
        const admin = makeUser({
            role: 'admin',
            access_scope: 'global',
            effective_permissions: ['*:*'],
        });
        const adminAuthz = buildAuthz(admin, makeHasPermission(admin.effective_permissions));
        expect(adminAuthz.canViewAdminConsole).toBe(true);
        expect(adminAuthz.canViewGovernance).toBe(false);
        expect(adminAuthz.canViewRiskHub).toBe(false);
        expect(adminAuthz.canViewActivityLog).toBe(false);
        expect(adminAuthz.canManageAccess).toBe(true);
        expect(adminAuthz.canEditAccessUsers).toBe(true);
        expect(adminAuthz.canReadRisks).toBe(true);

        const cro = makeUser({
            role: 'cro',
            access_scope: 'global',
            effective_permissions: ['risks:read'],
        });
        const croAuthz = buildAuthz(cro, makeHasPermission(cro.effective_permissions));
        expect(croAuthz.canViewRiskHub).toBe(true);
        expect(croAuthz.canViewAdminConsole).toBe(false);
        expect(croAuthz.canEditAccessUsers).toBe(true);
        expect(croAuthz.canReadRisks).toBe(true);

        const deptHead = makeUser({
            role: 'department_head',
            access_scope: 'department',
            department_id: 10,
            effective_permissions: [],
        });
        const deptHeadAuthz = buildAuthz(deptHead, makeHasPermission(deptHead.effective_permissions));
        expect(deptHeadAuthz.canViewDepartmentAccess).toBe(true);
        expect(deptHeadAuthz.canManageAccess).toBe(false);
        expect(deptHeadAuthz.canEditAccessUsers).toBe(false);
        expect(deptHeadAuthz.canViewUsersPage).toBe(true);
        expect(deptHeadAuthz.canReadRisks).toBe(false);

        const employee = makeUser({
            role: 'employee',
            access_scope: 'department',
            effective_permissions: ['users:read'],
        });
        const employeeAuthz = buildAuthz(employee, makeHasPermission(employee.effective_permissions));
        expect(employeeAuthz.canViewUsersPage).toBe(true);
        expect(employeeAuthz.canViewDepartmentAccess).toBe(false);
        expect(employeeAuthz.canViewRiskHub).toBe(false);
        expect(employeeAuthz.canEditAccessUsers).toBe(false);
    });

    it('UsersPage: global non-admin user can view access data but cannot see edit action', async () => {
        const user = makeUser({
            role: 'risk_manager',
            role_display_name: 'Risk Manager',
            access_scope: 'global',
            effective_permissions: ['users:read'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/access/users', () => HttpResponse.json([makeAccessUser()])),
        );

        renderWithRoute('/users');

        await screen.findByText('Employee One');
        expect(screen.queryByTitle('Edit Access')).not.toBeInTheDocument();
    });

    it('UsersPage: admin sees edit access action', async () => {
        const user = makeUser({
            role: 'admin',
            role_display_name: 'Administrator',
            access_scope: 'global',
            effective_permissions: ['*:*'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/access/users', () => HttpResponse.json([makeAccessUser()])),
        );

        renderWithRoute('/users');

        await screen.findByText('Employee One');
        expect(screen.getByTitle('Edit Access')).toBeInTheDocument();
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

    it('KRI: risks:delete shows "Unarchive" for archived KRI', async () => {
        const user = makeUser({
            id: 77,
            effective_permissions: ['risks:delete'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/kris/:id', () =>
                HttpResponse.json({
                    id: 1,
                    risk_id: 100,
                    metric_name: 'Archived Mock KRI',
                    description: 'Mock',
                    current_value: 50,
                    lower_limit: 0,
                    upper_limit: 100,
                    unit: '%',
                    breach_status: 'within',
                    last_updated: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                    frequency: 'monthly',
                    is_archived: true,
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

        await screen.findByRole('heading', { name: 'Archived Mock KRI' });
        expect(screen.getByRole('button', { name: /unarchive/i })).toBeInTheDocument();
    });

    it('KRI: without risks:delete hides "Unarchive" for archived KRI', async () => {
        const user = makeUser({
            id: 78,
            effective_permissions: ['risks:read'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/kris/:id', () =>
                HttpResponse.json({
                    id: 1,
                    risk_id: 100,
                    metric_name: 'Archived Mock KRI',
                    description: 'Mock',
                    current_value: 50,
                    lower_limit: 0,
                    upper_limit: 100,
                    unit: '%',
                    breach_status: 'within',
                    last_updated: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                    frequency: 'monthly',
                    is_archived: true,
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

        await screen.findByRole('heading', { name: 'Archived Mock KRI' });
        expect(screen.queryByRole('button', { name: /unarchive/i })).not.toBeInTheDocument();
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

    it('RisksPage: risks:delete shows "Unarchive" action for archived risk row', async () => {
        const user = makeUser({
            id: 90,
            effective_permissions: ['risks:delete'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/risks', () =>
                HttpResponse.json({
                    items: [
                        {
                            id: 1,
                            risk_id_code: 'R-ARCH-001',
                            name: 'Archived Risk',
                            process: 'Mock Process',
                            risk_type: 'operational',
                            category: 'Mock',
                            description: 'Mock Desc',
                            gross_score: 9,
                            gross_probability: 3,
                            gross_impact: 3,
                            net_score: 4,
                            status: 'archived',
                            is_priority: false,
                        },
                    ],
                    total: 1,
                    skip: 0,
                    limit: 20,
                })
            )
        );

        renderWithRoute('/risks');

        await screen.findByText('Archived Risk');
        expect(screen.getByTestId('risk-unarchive-1')).toBeInTheDocument();
    });

    it('RisksPage: without risks:delete hides "Unarchive" action for archived risk row', async () => {
        const user = makeUser({
            id: 91,
            effective_permissions: ['risks:read'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/risks', () =>
                HttpResponse.json({
                    items: [
                        {
                            id: 1,
                            risk_id_code: 'R-ARCH-001',
                            name: 'Archived Risk',
                            process: 'Mock Process',
                            risk_type: 'operational',
                            category: 'Mock',
                            description: 'Mock Desc',
                            gross_score: 9,
                            gross_probability: 3,
                            gross_impact: 3,
                            net_score: 4,
                            status: 'archived',
                            is_priority: false,
                        },
                    ],
                    total: 1,
                    skip: 0,
                    limit: 20,
                })
            )
        );

        renderWithRoute('/risks');

        await screen.findByText('Archived Risk');
        expect(screen.queryByTestId('risk-unarchive-1')).not.toBeInTheDocument();
    });

    it('ControlsPage: controls:delete shows "Unarchive" action for archived control row', async () => {
        const user = makeUser({
            id: 92,
            effective_permissions: ['controls:delete'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/controls', () =>
                HttpResponse.json({
                    items: [
                        {
                            id: 1,
                            name: 'Archived Control',
                            department_name: 'Operations',
                            frequency: 'monthly',
                            risk_level: 3,
                            status: 'archived',
                            control_form: 'manual',
                        },
                    ],
                    total: 1,
                    skip: 0,
                    limit: 20,
                })
            )
        );

        renderWithRoute('/controls');

        await screen.findByText('Archived Control');
        expect(screen.getByTestId('control-unarchive-1')).toBeInTheDocument();
    });

    it('ControlsPage: without controls:delete hides "Unarchive" action for archived control row', async () => {
        const user = makeUser({
            id: 93,
            effective_permissions: ['controls:read'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/controls', () =>
                HttpResponse.json({
                    items: [
                        {
                            id: 1,
                            name: 'Archived Control',
                            department_name: 'Operations',
                            frequency: 'monthly',
                            risk_level: 3,
                            status: 'archived',
                            control_form: 'manual',
                        },
                    ],
                    total: 1,
                    skip: 0,
                    limit: 20,
                })
            )
        );

        renderWithRoute('/controls');

        await screen.findByText('Archived Control');
        expect(screen.queryByTestId('control-unarchive-1')).not.toBeInTheDocument();
    });
});
