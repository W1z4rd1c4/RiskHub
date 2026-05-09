import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { AuthProviderWithReady, waitForAuthBootstrapReady } from '@test/authBootstrap';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { clearBootstrapSession } from '@/services/session/bootstrap';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { buildAuthz } from '@/authz/policy';

import { KRIDetailPage } from '@/pages/KRIDetailPage';
import { ControlDetailPage } from '@/pages/ControlDetailPage';
import { ControlsPage } from '@/pages/ControlsPage';
import { RisksPage } from '@/pages/RisksPage';
import { UsersPage } from '@/pages/UsersPage';
import { DepartmentsPage } from '@/pages/DepartmentsPage';

vi.mock('@/utils/userSettingsStorage', async () => {
    const actual = await vi.importActual<typeof import('@/utils/userSettingsStorage')>('@/utils/userSettingsStorage');
    return {
        ...actual,
        syncPreferencesFromServer: vi.fn(async () => undefined),
        clearLocalSettings: vi.fn(),
    };
});

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
    capabilities: {
        can_edit_identity: boolean;
        can_edit_business_access: boolean;
        can_edit_role: boolean;
        can_deactivate: boolean;
        can_change_active_status: boolean;
        can_break_glass_enable: boolean;
        can_revoke_sessions: boolean;
    };
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
    capabilities: {
        can_edit_identity: false,
        can_edit_business_access: false,
        can_edit_role: false,
        can_deactivate: false,
        can_change_active_status: false,
        can_break_glass_enable: false,
        can_revoke_sessions: false,
    },
    ...overrides,
});

function makeKriCapabilities(overrides: Partial<Record<string, boolean>> = {}) {
    return {
        can_read: true,
        can_update: false,
        can_update_sensitive_fields: false,
        can_request_update_approval: false,
        can_archive_immediately: false,
        can_request_archive_approval: false,
        can_restore: false,
        can_submit_value: false,
        can_submit_backdated_value: false,
        can_request_value_submission_approval: false,
        can_view_history: true,
        can_request_history_correction: false,
        can_apply_history_correction_immediately: false,
        can_link_vendors: false,
        can_unlink_vendors: false,
        can_view_linked_vendors: true,
        can_create_issue: false,
        has_pending_delete_approval: false,
        has_pending_update_approval: false,
        has_pending_value_submission_approval: false,
        has_pending_history_correction_approval: false,
        requires_privileged_update_approval: false,
        requires_privileged_delete_approval: false,
        ...overrides,
    };
}

function makeControlCapabilities(overrides: Partial<Record<string, boolean>> = {}) {
    return {
        can_read: true,
        can_update: false,
        can_update_sensitive_fields: false,
        can_request_update_approval: false,
        can_archive_immediately: false,
        can_request_archive_approval: false,
        can_restore: false,
        can_log_execution: false,
        can_view_executions: true,
        can_link_risk: false,
        can_unlink_risk: false,
        can_view_linked_risks: true,
        can_view_linked_vendors: true,
        can_create_issue: false,
        has_pending_delete_approval: false,
        has_pending_update_approval: false,
        requires_privileged_update_approval: false,
        requires_privileged_delete_approval: false,
        is_archived: false,
        is_executable: true,
        ...overrides,
    };
}

function makeRiskCapabilities(overrides: Partial<Record<string, boolean>> = {}) {
    return {
        can_read: true,
        can_update: false,
        can_update_sensitive_fields: false,
        can_request_update_approval: false,
        can_archive_immediately: false,
        can_request_archive_approval: false,
        can_restore: false,
        can_create_kri: false,
        can_create_linked_control: false,
        can_link_controls: false,
        can_unlink_controls: false,
        can_view_linked_controls: true,
        can_view_linked_vendors: true,
        can_send_questionnaire: false,
        can_create_issue: false,
        has_pending_delete_approval: false,
        has_pending_update_approval: false,
        requires_privileged_update_approval: false,
        requires_privileged_delete_approval: false,
        ...overrides,
    };
}

async function renderWithRoute(route: string) {
    const queryClient = createTestQueryClient();

    render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[route]}>
                <AuthProviderWithReady>
                    <DashboardFilterProvider>
                        <Routes>
                            <Route path="/kris/:id" element={<KRIDetailPage />} />
                            <Route path="/controls" element={<ControlsPage />} />
                            <Route path="/controls/:id" element={<ControlDetailPage />} />
                            <Route path="/departments" element={<DepartmentsPage />} />
                            <Route path="/risks" element={<RisksPage />} />
                            <Route path="/users" element={<UsersPage />} />
                        </Routes>
                    </DashboardFilterProvider>
                </AuthProviderWithReady>
            </MemoryRouter>
        </QueryClientProvider>
    );
    await waitForAuthBootstrapReady();
}

describe('RBAC UI gating', () => {
    beforeEach(() => {
        clearBootstrapSession();
        setAccessToken('test-token');
    });

    afterEach(() => {
        clearAccessToken();
        clearBootstrapSession();
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
        expect(adminAuthz.canViewAccessUsers).toBe(true);
        expect(adminAuthz.canViewDepartmentAccessUsers).toBe(false);
        expect(adminAuthz.canViewUserDirectory).toBe(true);
        expect(adminAuthz.canViewUsersRoute).toBe(true);
        expect(adminAuthz.canManageAccess).toBe(true);
        expect(adminAuthz.canReadRisks).toBe(true);
        expect(adminAuthz.canReadControls).toBe(true);
        expect(adminAuthz.canReadDepartments).toBe(true);

        const cro = makeUser({
            role: 'cro',
            access_scope: 'global',
            effective_permissions: ['risks:read'],
        });
        const croAuthz = buildAuthz(cro, makeHasPermission(cro.effective_permissions));
        expect(croAuthz.canViewRiskHub).toBe(true);
        expect(croAuthz.canViewGovernance).toBe(false);
        expect(croAuthz.canViewAdminConsole).toBe(false);
        expect(croAuthz.canViewAccessUsers).toBe(true);
        expect(croAuthz.canViewUsersRoute).toBe(true);
        expect(croAuthz.canReadRisks).toBe(true);
        expect(croAuthz.canReadControls).toBe(false);
        expect(croAuthz.canReadDepartments).toBe(false);

        const delegatedGovernanceOperator = makeUser({
            role: 'risk_manager',
            access_scope: 'global',
            effective_permissions: ['users:write'],
        });
        const delegatedGovernanceAuthz = buildAuthz(
            delegatedGovernanceOperator,
            makeHasPermission(delegatedGovernanceOperator.effective_permissions),
        );
        expect(delegatedGovernanceAuthz.canViewGovernance).toBe(true);

        const deptHead = makeUser({
            role: 'department_head',
            access_scope: 'department',
            department_id: 10,
            effective_permissions: [],
        });
        const deptHeadAuthz = buildAuthz(deptHead, makeHasPermission(deptHead.effective_permissions));
        expect(deptHeadAuthz.canViewDepartmentAccess).toBe(true);
        expect(deptHeadAuthz.canViewDepartmentAccessUsers).toBe(true);
        expect(deptHeadAuthz.canViewAccessUsers).toBe(false);
        expect(deptHeadAuthz.canViewUserDirectory).toBe(false);
        expect(deptHeadAuthz.canViewUsersRoute).toBe(true);
        expect(deptHeadAuthz.canManageAccess).toBe(false);
        expect(deptHeadAuthz.canViewUsersPage).toBe(true);
        expect(deptHeadAuthz.canReadRisks).toBe(false);

        const employee = makeUser({
            role: 'employee',
            access_scope: 'department',
            effective_permissions: ['users:read'],
        });
        const employeeAuthz = buildAuthz(employee, makeHasPermission(employee.effective_permissions));
        expect(employeeAuthz.canViewUserDirectory).toBe(true);
        expect(employeeAuthz.canViewUsersRoute).toBe(true);
        expect(employeeAuthz.canViewAccessUsers).toBe(false);
        expect(employeeAuthz.canViewUsersPage).toBe(true);
        expect(employeeAuthz.canViewDepartmentAccess).toBe(false);
        expect(employeeAuthz.canViewRiskHub).toBe(false);
    });

    it('Authz policy: prefers backend me-capabilities over role-string inference when available', () => {
        const admin = makeUser({
            role: 'admin',
            access_scope: 'global',
            effective_permissions: ['*:*'],
        });
        const backendCapabilities = {
            can_view_user_directory: false,
            can_view_access_users: false,
            can_view_department_access_users: false,
            can_view_users_route: false,
            can_manage_access: false,
            can_view_department_access: false,
            can_view_admin_console: false,
            can_view_riskhub: true,
            can_view_governance: true,
            can_view_activity_log: true,
            can_view_committee: true,
            can_view_users_page: false,
            is_second_line: true,
            can_read_risks: false,
            can_read_controls: false,
            can_read_vendors: false,
            can_read_departments: false,
            resource_permissions: {
                'risks:read': false,
                'controls:read': false,
                'vendors:read': false,
                'departments:read': false,
                'users:read': false,
                'users:write': false,
            },
        };

        const authz = buildAuthz(admin, makeHasPermission(admin.effective_permissions), backendCapabilities, true);

        expect(authz.canViewAdminConsole).toBe(false);
        expect(authz.canViewRiskHub).toBe(true);
        expect(authz.canViewGovernance).toBe(true);
        expect(authz.canReadRisks).toBe(false);
        expect(authz.can('read', 'risks')).toBe(false);
        expect(authz.can('write', 'users')).toBe(false);
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
            http.get('*/api/v1/access/users', () => HttpResponse.json([makeAccessUser({
                capabilities: {
                    can_edit_identity: false,
                    can_edit_business_access: false,
                    can_edit_role: false,
                    can_deactivate: false,
                    can_change_active_status: false,
                    can_break_glass_enable: false,
                    can_revoke_sessions: false,
                },
            })])),
        );

        await renderWithRoute('/users');

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
            http.get('*/api/v1/access/users', () => HttpResponse.json([makeAccessUser({
                capabilities: {
                    can_edit_identity: true,
                    can_edit_business_access: true,
                    can_edit_role: true,
                    can_deactivate: true,
                    can_change_active_status: true,
                    can_break_glass_enable: true,
                    can_revoke_sessions: true,
                },
            })])),
        );

        await renderWithRoute('/users');

        await screen.findByText('Employee One');
        expect(await screen.findByTitle('Edit Access')).toBeInTheDocument();
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
                    capabilities: makeKriCapabilities(),
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

        await renderWithRoute('/kris/1');

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
                    capabilities: makeKriCapabilities({ can_submit_value: true }),
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

        await renderWithRoute('/kris/1');

        await screen.findByRole('heading', { name: 'Mock KRI' });
        expect(await screen.findByRole('button', { name: /record value/i })).toBeInTheDocument();
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
                    capabilities: makeKriCapabilities({ can_submit_value: true }),
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

        await renderWithRoute('/kris/1');

        await screen.findByRole('heading', { name: 'Mock KRI' });
        expect(await screen.findByRole('button', { name: /record value/i })).toBeInTheDocument();
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
                    capabilities: makeKriCapabilities({ can_restore: true }),
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

        await renderWithRoute('/kris/1');

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
                    capabilities: makeKriCapabilities({ can_restore: false }),
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

        await renderWithRoute('/kris/1');

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
                    is_archived: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    control_owner: { id: 20, name: 'Owner', email: 'owner@riskhub.test' },
                    department: { id: 1, name: 'Ops', code: 'OPS' },
                    capabilities: makeControlCapabilities({ can_log_execution: false }),
                })
            ),
            http.get('*/api/v1/controls/:id/risks', () => HttpResponse.json([])),
            http.get('*/api/v1/controls/:id/executions', () => HttpResponse.json([]))
        );

        await renderWithRoute('/controls/1');

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
                    is_archived: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    control_owner: { id: 21, name: 'Owner', email: 'owner@riskhub.test' },
                    department: { id: 1, name: 'Ops', code: 'OPS' },
                    capabilities: makeControlCapabilities({ can_log_execution: true }),
                })
            ),
            http.get('*/api/v1/controls/:id/risks', () => HttpResponse.json([])),
            http.get('*/api/v1/controls/:id/executions', () => HttpResponse.json([]))
        );

        await renderWithRoute('/controls/1');

        await screen.findByText('Mock Control');
        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByRole('button', { name: /execution history/i }));

        expect(await screen.findByText(/execution audit trail/i)).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: /log execution/i })).toBeInTheDocument();
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
                            status: 'active',
                            is_archived: true,
                            is_priority: false,
                            capabilities: makeRiskCapabilities({ can_restore: true }),
                        },
                    ],
                    total: 1,
                    offset: 0,
                    limit: 20,
                })
            )
        );

        await renderWithRoute('/risks');

        await screen.findByText('Archived Risk');
        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('risks-status-filter-trigger'));
        await uiUser.click(screen.getByTestId('risks-status-filter-option-archived'));
        expect(await screen.findByTestId('risk-unarchive-1')).toBeInTheDocument();
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
                            status: 'active',
                            is_archived: true,
                            is_priority: false,
                            capabilities: makeRiskCapabilities({ can_restore: false }),
                        },
                    ],
                    total: 1,
                    offset: 0,
                    limit: 20,
                })
            )
        );

        await renderWithRoute('/risks');

        await screen.findByText('Archived Risk');
        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('risks-status-filter-trigger'));
        await uiUser.click(screen.getByTestId('risks-status-filter-option-archived'));
        expect(screen.queryByTestId('risk-unarchive-1')).not.toBeInTheDocument();
    });

    it.each([
        ['false capability', { can_create: true, can_export: false }],
        ['missing capability', { can_create: true }],
        ['missing capabilities', undefined],
    ])('RisksPage: hides export when list returns %s', async (_caseName, capabilities) => {
        const user = makeUser({
            id: 94,
            effective_permissions: ['risks:read', 'reports:read'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/risks', () =>
                HttpResponse.json({
                    items: [
                        {
                            id: 2,
                            risk_id_code: 'R-EXPORT-001',
                            name: 'Export Visibility Risk',
                            process: 'Mock Process',
                            risk_type: 'operational',
                            category: 'Mock',
                            description: 'Mock Desc',
                            gross_score: 9,
                            gross_probability: 3,
                            gross_impact: 3,
                            net_score: 4,
                            status: 'active',
                            is_priority: false,
                            capabilities: makeRiskCapabilities(),
                        },
                    ],
                    total: 1,
                    offset: 0,
                    limit: 20,
                    capabilities,
                })
            )
        );

        await renderWithRoute('/risks');

        await screen.findByText('Export Visibility Risk');
        expect(screen.queryByTestId('risks-export-button')).not.toBeInTheDocument();
    });

    it('RisksPage: shows export when list can_export is true', async () => {
        const user = makeUser({
            id: 95,
            effective_permissions: ['risks:read'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/risks', () =>
                HttpResponse.json({
                    items: [
                        {
                            id: 3,
                            risk_id_code: 'R-EXPORT-002',
                            name: 'Allowed Export Risk',
                            process: 'Mock Process',
                            risk_type: 'operational',
                            category: 'Mock',
                            description: 'Mock Desc',
                            gross_score: 9,
                            gross_probability: 3,
                            gross_impact: 3,
                            net_score: 4,
                            status: 'active',
                            is_priority: false,
                            capabilities: makeRiskCapabilities(),
                        },
                    ],
                    total: 1,
                    offset: 0,
                    limit: 20,
                    capabilities: { can_export: true },
                })
            )
        );

        await renderWithRoute('/risks');

        await screen.findByText('Allowed Export Risk');
        expect(screen.getByTestId('risks-export-button')).toBeInTheDocument();
    });

    it('RisksPage: forbidden refetch clears stale rows and collection actions', async () => {
        const user = makeUser({
            id: 198,
            effective_permissions: ['risks:read', 'reports:read'],
        });
        let requestCount = 0;

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/risks', () => {
                requestCount += 1;
                if (requestCount > 1) {
                    return HttpResponse.json({ detail: 'Forbidden' }, { status: 403 });
                }
                return HttpResponse.json({
                    items: [
                        {
                            id: 4,
                            risk_id_code: 'R-STALE-001',
                            name: 'Stale Risk Row',
                            process: 'Mock Process',
                            risk_type: 'operational',
                            category: 'Mock',
                            description: 'Mock Desc',
                            gross_score: 9,
                            gross_probability: 3,
                            gross_impact: 3,
                            net_score: 4,
                            status: 'active',
                            is_priority: false,
                            capabilities: makeRiskCapabilities({ can_restore: true }),
                        },
                    ],
                    total: 1,
                    offset: 0,
                    limit: 20,
                    capabilities: { can_create: true, can_export: true },
                });
            })
        );

        await renderWithRoute('/risks');

        await screen.findByText('Stale Risk Row');
        expect(screen.getByTestId('risks-export-button')).toBeInTheDocument();
        expect(screen.getByTestId('risks-create-button')).toBeInTheDocument();

        await userEvent.click(screen.getByTestId('risks-refresh-button'));

        await screen.findByRole('heading', { name: /access denied/i });
        expect(screen.queryByText('Stale Risk Row')).not.toBeInTheDocument();
        expect(screen.queryByTestId('risks-export-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('risks-create-button')).not.toBeInTheDocument();
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
                            status: 'active',
                            is_archived: true,
                            control_form: 'manual',
                            capabilities: makeControlCapabilities({ can_restore: true, is_archived: true }),
                        },
                    ],
                    total: 1,
                    offset: 0,
                    limit: 20,
                })
            )
        );

        await renderWithRoute('/controls');

        await screen.findByText('Archived Control');
        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('controls-status-filter-trigger'));
        await uiUser.click(screen.getByTestId('controls-status-filter-option-archived'));
        expect(await screen.findByTestId('control-unarchive-1')).toBeInTheDocument();
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
                            status: 'active',
                            is_archived: true,
                            control_form: 'manual',
                            capabilities: makeControlCapabilities({ can_restore: false, is_archived: true }),
                        },
                    ],
                    total: 1,
                    offset: 0,
                    limit: 20,
                })
            )
        );

        await renderWithRoute('/controls');

        await screen.findByText('Archived Control');
        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('controls-status-filter-trigger'));
        await uiUser.click(screen.getByTestId('controls-status-filter-option-archived'));
        expect(screen.queryByTestId('control-unarchive-1')).not.toBeInTheDocument();
    });

    it.each([
        ['false capability', { can_create: true, can_export: false }],
        ['missing capability', { can_create: true }],
        ['missing capabilities', undefined],
    ])('ControlsPage: hides export when list returns %s', async (_caseName, capabilities) => {
        const user = makeUser({
            id: 96,
            effective_permissions: ['controls:read', 'reports:read'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/controls', () =>
                HttpResponse.json({
                    items: [
                        {
                            id: 2,
                            name: 'Export Visibility Control',
                            department_name: 'Operations',
                            frequency: 'monthly',
                            risk_level: 3,
                            status: 'active',
                            is_archived: false,
                            control_form: 'manual',
                            capabilities: makeControlCapabilities(),
                        },
                    ],
                    total: 1,
                    offset: 0,
                    limit: 20,
                    capabilities,
                })
            )
        );

        await renderWithRoute('/controls');

        await screen.findByText('Export Visibility Control');
        expect(screen.queryByTestId('controls-export-button')).not.toBeInTheDocument();
    });

    it('ControlsPage: shows export when list can_export is true', async () => {
        const user = makeUser({
            id: 97,
            effective_permissions: ['controls:read'],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/controls', () =>
                HttpResponse.json({
                    items: [
                        {
                            id: 3,
                            name: 'Allowed Export Control',
                            department_name: 'Operations',
                            frequency: 'monthly',
                            risk_level: 3,
                            status: 'active',
                            is_archived: false,
                            control_form: 'manual',
                            capabilities: makeControlCapabilities(),
                        },
                    ],
                    total: 1,
                    offset: 0,
                    limit: 20,
                    capabilities: { can_export: true },
                })
            )
        );

        await renderWithRoute('/controls');

        await screen.findByText('Allowed Export Control');
        expect(screen.getByTestId('controls-export-button')).toBeInTheDocument();
    });

    it('ControlsPage: forbidden refetch clears stale rows and collection actions', async () => {
        const user = makeUser({
            id: 199,
            effective_permissions: ['controls:read', 'reports:read'],
        });
        let requestCount = 0;

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/controls', () => {
                requestCount += 1;
                if (requestCount > 1) {
                    return HttpResponse.json({ detail: 'Forbidden' }, { status: 403 });
                }
                return HttpResponse.json({
                    items: [
                        {
                            id: 4,
                            name: 'Stale Control Row',
                            department_name: 'Operations',
                            frequency: 'monthly',
                            risk_level: 3,
                            status: 'active',
                            is_archived: false,
                            control_form: 'manual',
                            capabilities: makeControlCapabilities(),
                        },
                    ],
                    total: 1,
                    offset: 0,
                    limit: 20,
                    capabilities: { can_create: true, can_export: true },
                });
            })
        );

        await renderWithRoute('/controls');

        await screen.findByText('Stale Control Row');
        expect(screen.getByTestId('controls-export-button')).toBeInTheDocument();
        expect(screen.getByTestId('controls-create-button')).toBeInTheDocument();

        await userEvent.click(screen.getByTestId('controls-refresh-button'));

        await screen.findByRole('heading', { name: /access denied/i });
        expect(screen.queryByText('Stale Control Row')).not.toBeInTheDocument();
        expect(screen.queryByTestId('controls-export-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('controls-create-button')).not.toBeInTheDocument();
    });

    it('DepartmentsPage: renders denied when the backend refuses department reads', async () => {
        const user = makeUser({
            id: 200,
            effective_permissions: [],
        });

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/departments', () => HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }))
        );

        await renderWithRoute('/departments');

        await screen.findByRole('heading', { name: /access denied/i });
        expect(screen.queryByText('Department Exposure')).not.toBeInTheDocument();
    });
});
