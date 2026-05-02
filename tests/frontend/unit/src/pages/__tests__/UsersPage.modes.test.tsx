import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { HTMLAttributes, ReactNode } from 'react';

import { AuthProviderWithReady, waitForAuthBootstrapReady } from '@test/authBootstrap';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { clearBootstrapSession } from '@/services/session/bootstrap';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { UsersPage } from '@/pages/UsersPage';

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: {
        div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
}));

vi.mock('@/components/ui/ThemedSelect', () => ({
    ThemedSelect: ({
        value,
        onValueChange,
        options = [],
        placeholder,
        allowEmpty,
        emptyLabel,
        className,
    }: {
        value: string;
        onValueChange: (value: string) => void;
        options?: Array<{ value: string; label: string }>;
        placeholder?: string;
        allowEmpty?: boolean;
        emptyLabel?: string;
        className?: string;
    }) => (
        <select
            aria-label={placeholder ?? 'select'}
            className={className}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
        >
            {allowEmpty && <option value="">{emptyLabel ?? placeholder ?? 'None'}</option>}
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

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
    department_id?: number | null;
    department_name?: string | null;
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
    external_id?: string | null;
    deprovision_reason?: string | null;
    capabilities?: {
        can_edit_identity: boolean;
        can_edit_business_access: boolean;
        can_edit_role: boolean;
        can_deactivate: boolean;
        can_change_active_status?: boolean;
        can_break_glass_enable?: boolean;
        can_revoke_sessions: boolean;
    } | null;
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
    external_id: null,
    deprovision_reason: null,
    capabilities: {
        can_edit_identity: true,
        can_edit_business_access: false,
        can_edit_role: true,
        can_deactivate: true,
        can_change_active_status: true,
        can_break_glass_enable: false,
        can_revoke_sessions: true,
    },
    ...overrides,
});

function makeDirectoryResponse(overrides?: {
    items?: Array<{
        id: number;
        name: string;
        email: string;
        role_name: string | null;
        role_display_name: string | null;
        department_id: number | null;
        department_name: string | null;
    }>;
    available_roles?: Array<{ name: string; display_name: string; count: number }>;
    total?: number;
    skip?: number;
    limit?: number;
    capabilities?: {
        can_read_directory: boolean;
        can_view_access_details: boolean;
        can_use_role_facets: boolean;
        can_create_local_user: boolean;
        can_import_directory_user: boolean;
    } | null;
}) {
    return {
        items: overrides?.items ?? [],
        available_roles: overrides?.available_roles ?? [],
        total: overrides?.total ?? 0,
        skip: overrides?.skip ?? 0,
        limit: overrides?.limit ?? 50,
        capabilities: overrides?.capabilities ?? {
            can_read_directory: true,
            can_view_access_details: true,
            can_use_role_facets: true,
            can_create_local_user: false,
            can_import_directory_user: false,
        },
    };
}

async function renderUsersRoute(route = '/users') {
    const queryClient = createTestQueryClient();

    render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[route]}>
                <AuthProviderWithReady>
                    <DashboardFilterProvider>
                        <Routes>
                            <Route path="/" element={<div>Home route</div>} />
                            <Route path="/users" element={<UsersPage />} />
                        </Routes>
                    </DashboardFilterProvider>
                </AuthProviderWithReady>
            </MemoryRouter>
        </QueryClientProvider>
    );

    await waitForAuthBootstrapReady();
}

async function renderUsersRouteEntry(
    entry: string | { pathname: string; state?: Record<string, unknown> }
) {
    const queryClient = createTestQueryClient();

    render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[entry]}>
                <AuthProviderWithReady>
                    <DashboardFilterProvider>
                        <Routes>
                            <Route path="/" element={<div>Home route</div>} />
                            <Route path="/users" element={<UsersPage />} />
                        </Routes>
                    </DashboardFilterProvider>
                </AuthProviderWithReady>
            </MemoryRouter>
        </QueryClientProvider>
    );

    await waitForAuthBootstrapReady();
}

describe('UsersPage mode selection', () => {
    beforeEach(() => {
        clearBootstrapSession();
        setAccessToken('test-token');
    });

    afterEach(() => {
        clearAccessToken();
        clearBootstrapSession();
    });

    it('uses global access mode for global privileged users', async () => {
        const accessHandler = vi.fn(() => HttpResponse.json([makeAccessUser()]));
        const deptAccessHandler = vi.fn(() => HttpResponse.json([]));
        const directoryHandler = vi.fn(() =>
            HttpResponse.json(makeDirectoryResponse())
        );

        server.use(
            http.get('*/api/v1/auth/me', () =>
                HttpResponse.json(
                    makeUser({
                        role: 'risk_manager',
                        role_display_name: 'Risk Manager',
                        access_scope: 'global',
                        effective_permissions: ['users:read'],
                    })
                )
            ),
            http.get('*/api/v1/access/users', accessHandler),
            http.get('*/api/v1/access/users/my-department', deptAccessHandler),
            http.get('*/api/v1/users/directory', directoryHandler)
        );

        await renderUsersRoute();

        await screen.findByText('Employee One');
        expect(accessHandler).toHaveBeenCalledTimes(1);
        expect(deptAccessHandler).not.toHaveBeenCalled();
        expect(directoryHandler).toHaveBeenCalledTimes(1);
    });

    it('uses backend capabilities to hide active status changes', async () => {
        server.use(
            http.get('*/api/v1/auth/me', () =>
                HttpResponse.json(
                    makeUser({
                        role: 'admin',
                        role_display_name: 'Administrator',
                        access_scope: 'global',
                        effective_permissions: ['users:read', 'users:write'],
                    })
                )
            ),
            http.get('*/api/v1/access/users', () =>
                HttpResponse.json([
                    makeAccessUser({
                        capabilities: {
                            can_edit_identity: true,
                            can_edit_business_access: false,
                            can_edit_role: true,
                            can_deactivate: false,
                            can_change_active_status: false,
                            can_break_glass_enable: false,
                            can_revoke_sessions: true,
                        },
                    }),
                ])
            ),
            http.get('*/api/v1/access/users/my-department', () => HttpResponse.json([])),
            http.get('*/api/v1/users/directory', () => HttpResponse.json(makeDirectoryResponse()))
        );

        await renderUsersRoute();

        expect(await screen.findByText('Employee One')).toBeInTheDocument();
        expect(screen.queryByLabelText('Deactivate')).not.toBeInTheDocument();
    });

    it('hides active status changes when capability metadata is absent', async () => {
        server.use(
            http.get('*/api/v1/auth/me', () =>
                HttpResponse.json(
                    makeUser({
                        role: 'admin',
                        role_display_name: 'Administrator',
                        access_scope: 'global',
                        effective_permissions: ['users:read', 'users:write'],
                    })
                )
            ),
            http.get('*/api/v1/access/users', () =>
                HttpResponse.json([
                    makeAccessUser({
                        capabilities: null,
                    }),
                ])
            ),
            http.get('*/api/v1/access/users/my-department', () => HttpResponse.json([])),
            http.get('*/api/v1/users/directory', () => HttpResponse.json(makeDirectoryResponse()))
        );

        await renderUsersRoute();

        expect(await screen.findByText('Employee One')).toBeInTheDocument();
        expect(screen.queryByLabelText('Deactivate')).not.toBeInTheDocument();
    });

    it('shows backend active status rejection messages', async () => {
        server.use(
            http.get('*/api/v1/auth/me', () =>
                HttpResponse.json(
                    makeUser({
                        role: 'admin',
                        role_display_name: 'Administrator',
                        access_scope: 'global',
                        effective_permissions: ['users:read', 'users:write'],
                    })
                )
            ),
            http.get('*/api/v1/access/users', () =>
                HttpResponse.json([
                    makeAccessUser({
                        is_active: false,
                        capabilities: {
                            can_edit_identity: true,
                            can_edit_business_access: false,
                            can_edit_role: true,
                            can_deactivate: true,
                            can_change_active_status: true,
                            can_break_glass_enable: false,
                            can_revoke_sessions: true,
                        },
                    }),
                ])
            ),
            http.patch('*/api/v1/users/:id', () =>
                HttpResponse.json(
                    { detail: 'Directory-deprovisioned users require break-glass enable before reactivation.' },
                    { status: 403 }
                )
            ),
            http.get('*/api/v1/access/users/my-department', () => HttpResponse.json([])),
            http.get('*/api/v1/users/directory', () => HttpResponse.json(makeDirectoryResponse()))
        );

        await renderUsersRoute();

        const user = userEvent.setup();
        await user.click(await screen.findByLabelText('Activate'));
        await user.click(screen.getByRole('button', { name: 'Reactivate' }));

        expect(
            await screen.findByText('Directory-deprovisioned users require break-glass enable before reactivation.')
        ).toBeInTheDocument();
    });

    it('submits break-glass enable for eligible directory users', async () => {
        const breakGlassHandler = vi.fn(async ({ request }) => {
            const body = await request.json() as { reason: string; expires_in_hours: number };
            expect(body).toEqual({ reason: 'Emergency owner handoff', expires_in_hours: 6 });
            return HttpResponse.json({ status: 'success', user_id: 200 });
        });

        server.use(
            http.get('*/api/v1/auth/me', () =>
                HttpResponse.json(
                    makeUser({
                        role: 'admin',
                        role_display_name: 'Administrator',
                        access_scope: 'global',
                        effective_permissions: ['users:read', 'users:write'],
                    })
                )
            ),
            http.get('*/api/v1/access/users', () =>
                HttpResponse.json([
                    makeAccessUser({
                        is_active: false,
                        external_id: 'oid-break-glass-ui',
                        deprovision_reason: 'directory_disabled',
                        capabilities: {
                            can_edit_identity: true,
                            can_edit_business_access: false,
                            can_edit_role: true,
                            can_deactivate: true,
                            can_change_active_status: true,
                            can_break_glass_enable: true,
                            can_revoke_sessions: true,
                        },
                    }),
                ])
            ),
            http.post('*/api/v1/admin/directory/break-glass-enable/:id', breakGlassHandler),
            http.get('*/api/v1/access/users/my-department', () => HttpResponse.json([])),
            http.get('*/api/v1/users/directory', () => HttpResponse.json(makeDirectoryResponse()))
        );

        await renderUsersRoute();

        const user = userEvent.setup();
        await user.click(await screen.findByRole('button', { name: /Break-glass/i }));
        await user.type(screen.getByLabelText('Reason'), 'Emergency owner handoff');
        await user.clear(screen.getByLabelText('Expires in hours'));
        await user.type(screen.getByLabelText('Expires in hours'), '6');
        await user.click(screen.getByRole('button', { name: 'Break-glass enable' }));

        await waitFor(() => expect(breakGlassHandler).toHaveBeenCalledTimes(1));
        expect(await screen.findByText('Employee One enabled through break-glass access.')).toBeInTheDocument();
    });

    it('uses department access mode for department heads', async () => {
        const accessHandler = vi.fn(() => HttpResponse.json([]));
        const deptAccessHandler = vi.fn(() => HttpResponse.json([makeAccessUser({ name: 'Dept Member' })]));
        const directoryHandler = vi.fn(() =>
            HttpResponse.json(makeDirectoryResponse())
        );

        server.use(
            http.get('*/api/v1/auth/me', () =>
                HttpResponse.json(
                    makeUser({
                        role: 'department_head',
                        role_display_name: 'Department Head',
                        access_scope: 'department',
                        department_id: 10,
                        department_name: 'Operations',
                        effective_permissions: [],
                    })
                )
            ),
            http.get('*/api/v1/access/users', accessHandler),
            http.get('*/api/v1/access/users/my-department', deptAccessHandler),
            http.get('*/api/v1/users/directory', directoryHandler)
        );

        await renderUsersRoute();

        await screen.findByText('Dept Member');
        expect(accessHandler).not.toHaveBeenCalled();
        expect(deptAccessHandler).toHaveBeenCalledTimes(1);
        expect(directoryHandler).not.toHaveBeenCalled();
    });

    it('uses directory mode for users with directory entitlement only', async () => {
        const accessHandler = vi.fn(() => HttpResponse.json([]));
        const deptAccessHandler = vi.fn(() => HttpResponse.json([]));
        const directoryHandler = vi.fn(() =>
            HttpResponse.json(makeDirectoryResponse({
                items: [
                    {
                        id: 301,
                        name: 'Visible Colleague',
                        email: 'colleague@riskhub.test',
                        role_name: 'employee',
                        role_display_name: 'Employee',
                        department_id: 10,
                        department_name: 'Operations',
                    },
                ],
                available_roles: [{ name: 'employee', display_name: 'Employee', count: 1 }],
                total: 1,
                skip: 0,
                limit: 50,
            }))
        );

        server.use(
            http.get('*/api/v1/auth/me', () =>
                HttpResponse.json(
                    makeUser({
                        role: 'employee',
                        role_display_name: 'Employee',
                        access_scope: 'department',
                        effective_permissions: ['users:read'],
                    })
                )
            ),
            http.get('*/api/v1/access/users', accessHandler),
            http.get('*/api/v1/access/users/my-department', deptAccessHandler),
            http.get('*/api/v1/users/directory', directoryHandler)
        );

        await renderUsersRoute();

        await screen.findByText('Visible Colleague');
        expect(screen.queryByText('Privileged')).not.toBeInTheDocument();
        expect(screen.queryByText('Sys Admins')).not.toBeInTheDocument();
        expect(screen.queryByTitle('Edit Access')).not.toBeInTheDocument();
        expect(accessHandler).not.toHaveBeenCalled();
        expect(deptAccessHandler).not.toHaveBeenCalled();
        expect(directoryHandler).toHaveBeenCalledTimes(1);
    });

    it('renders directory users with null role and department metadata', async () => {
        const accessHandler = vi.fn(() => HttpResponse.json([]));
        const deptAccessHandler = vi.fn(() => HttpResponse.json([]));
        const directoryHandler = vi.fn(() =>
            HttpResponse.json(makeDirectoryResponse({
                items: [
                    {
                        id: 302,
                        name: 'Unassigned Colleague',
                        email: 'unassigned@riskhub.test',
                        role_name: null,
                        role_display_name: null,
                        department_id: null,
                        department_name: null,
                    },
                ],
                total: 1,
            }))
        );

        server.use(
            http.get('*/api/v1/auth/me', () =>
                HttpResponse.json(
                    makeUser({
                        role: 'employee',
                        role_display_name: 'Employee',
                        access_scope: 'department',
                        effective_permissions: ['users:read'],
                    })
                )
            ),
            http.get('*/api/v1/access/users', accessHandler),
            http.get('*/api/v1/access/users/my-department', deptAccessHandler),
            http.get('*/api/v1/users/directory', directoryHandler)
        );

        await renderUsersRoute();

        expect(await screen.findByText('Unassigned Colleague')).toBeInTheDocument();
        expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
        expect(screen.getByText('No department')).toBeInTheDocument();
        expect(accessHandler).not.toHaveBeenCalled();
        expect(deptAccessHandler).not.toHaveBeenCalled();
        expect(directoryHandler).toHaveBeenCalledTimes(1);
    });

    it('renders a retryable load error instead of an empty-state table when /users fetch fails', async () => {
        server.use(
            http.get('*/api/v1/auth/me', () =>
                HttpResponse.json(
                    makeUser({
                        role: 'risk_manager',
                        role_display_name: 'Risk Manager',
                        access_scope: 'global',
                        effective_permissions: ['users:read'],
                    })
                )
            ),
            http.get('*/api/v1/access/users', () =>
                HttpResponse.json({ detail: 'boom' }, { status: 500 })
            ),
            http.get('*/api/v1/access/users/my-department', () => HttpResponse.json([])),
            http.get('*/api/v1/users/directory', () =>
                HttpResponse.json(makeDirectoryResponse())
            )
        );

        await renderUsersRoute();

        expect(await screen.findByText('Refresh the page data before treating this as an empty result.')).toBeInTheDocument();
        expect(screen.queryByText('No users found matching your criteria.')).not.toBeInTheDocument();
    });

    it('redirects to home when the user lacks any users-route entitlement', async () => {
        const accessHandler = vi.fn(() => HttpResponse.json([]));
        const deptAccessHandler = vi.fn(() => HttpResponse.json([]));
        const directoryHandler = vi.fn(() =>
            HttpResponse.json(makeDirectoryResponse())
        );

        server.use(
            http.get('*/api/v1/auth/me', () =>
                HttpResponse.json(
                    makeUser({
                        role: 'employee',
                        role_display_name: 'Employee',
                        access_scope: 'department',
                        effective_permissions: [],
                    })
                )
            ),
            http.get('*/api/v1/access/users', accessHandler),
            http.get('*/api/v1/access/users/my-department', deptAccessHandler),
            http.get('*/api/v1/users/directory', directoryHandler)
        );

        await renderUsersRoute();

        await waitFor(() => {
            expect(screen.getByText('Home route')).toBeInTheDocument();
        });
        expect(accessHandler).not.toHaveBeenCalled();
        expect(deptAccessHandler).not.toHaveBeenCalled();
        expect(directoryHandler).not.toHaveBeenCalled();
    });

    it('uses backend-provided directory role facets for filter options and requests', async () => {
        const directoryHandler = vi.fn(({ request }) => {
            const url = new URL(request.url);
            const selectedRole = url.searchParams.get('role_name');

            return HttpResponse.json(
                makeDirectoryResponse({
                    items: selectedRole === 'viewer'
                        ? [
                            {
                                id: 302,
                                name: 'Visible Viewer',
                                email: 'viewer@riskhub.test',
                                role_name: 'viewer',
                                role_display_name: 'Viewer',
                                department_id: 10,
                                department_name: 'Operations',
                            },
                        ]
                        : [
                            {
                                id: 301,
                                name: 'Visible Colleague',
                                email: 'colleague@riskhub.test',
                                role_name: 'employee',
                                role_display_name: 'Employee',
                                department_id: 10,
                                department_name: 'Operations',
                            },
                        ],
                    available_roles: [
                        { name: 'employee', display_name: 'Employee', count: 1 },
                        { name: 'viewer', display_name: 'Viewer', count: 1 },
                    ],
                    total: 1,
                })
            );
        });

        server.use(
            http.get('*/api/v1/auth/me', () =>
                HttpResponse.json(
                    makeUser({
                        role: 'employee',
                        role_display_name: 'Employee',
                        access_scope: 'department',
                        effective_permissions: ['users:read'],
                    })
                )
            ),
            http.get('*/api/v1/access/users', () => HttpResponse.json([])),
            http.get('*/api/v1/access/users/my-department', () => HttpResponse.json([])),
            http.get('*/api/v1/users/directory', directoryHandler)
        );

        await renderUsersRoute();

        expect(await screen.findByText('Visible Colleague')).toBeInTheDocument();
        const roleFilter = screen.getByRole('combobox');
        expect(screen.getByRole('option', { name: 'Viewer' })).toBeInTheDocument();

        const user = userEvent.setup();
        await user.selectOptions(roleFilter, 'viewer');

        await waitFor(() => {
            expect(directoryHandler).toHaveBeenCalledTimes(2);
        });
        expect(await screen.findByText('Visible Viewer')).toBeInTheDocument();

        const lastCall = directoryHandler.mock.calls.at(-1)?.[0];
        expect(lastCall).toBeDefined();
        const lastUrl = new URL(lastCall.request.url);
        expect(lastUrl.searchParams.get('role_name')).toBe('viewer');
    });

    it('re-opens the imported user in the /users access modal after directory import', async () => {
        const importedUser = makeAccessUser({
            id: 42,
            name: 'Imported User',
            email: 'imported.user@riskhub.test',
        });

        server.use(
            http.get('*/api/v1/auth/me', () =>
                HttpResponse.json(
                    makeUser({
                        role: 'admin',
                        role_display_name: 'Administrator',
                        access_scope: 'global',
                        effective_permissions: ['users:read', 'users:write'],
                    })
                )
            ),
            http.get('*/api/v1/access/users', () => HttpResponse.json([importedUser])),
            http.get('*/api/v1/access/users/my-department', () => HttpResponse.json([])),
            http.get('*/api/v1/access/roles', () =>
                HttpResponse.json([
                    {
                        id: 2,
                        name: 'employee',
                        display_name: 'Employee',
                        description: 'Standard employee',
                        permissions: ['risks:read'],
                    },
                ])
            ),
            http.get('*/api/v1/departments', () => HttpResponse.json([])),
            http.get('*/api/v1/users/directory', () =>
                HttpResponse.json(makeDirectoryResponse())
            )
        );

        await renderUsersRouteEntry({
            pathname: '/users',
            state: {
                importedUserId: 42,
                importedUserName: 'Imported User',
            },
        });

        await screen.findByText('Imported User imported from directory.');
        expect(await screen.findByDisplayValue('Imported User')).toBeInTheDocument();
    });
});
