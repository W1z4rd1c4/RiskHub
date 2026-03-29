import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { AuthProviderWithReady, waitForAuthBootstrapReady } from '@test/authBootstrap';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';
import { clearAccessToken, setAccessToken } from '@/services/accessTokenStore';
import { clearBootstrapSession } from '@/services/authSessionCoordinator';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { UsersPage } from '@/pages/UsersPage';

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
    ...overrides,
});

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
            HttpResponse.json({ items: [], total: 0, skip: 0, limit: 50 })
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
        expect(directoryHandler).not.toHaveBeenCalled();
    });

    it('uses department access mode for department heads', async () => {
        const accessHandler = vi.fn(() => HttpResponse.json([]));
        const deptAccessHandler = vi.fn(() => HttpResponse.json([makeAccessUser({ name: 'Dept Member' })]));
        const directoryHandler = vi.fn(() =>
            HttpResponse.json({ items: [], total: 0, skip: 0, limit: 50 })
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
            HttpResponse.json({
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
                total: 1,
                skip: 0,
                limit: 50,
            })
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
        expect(screen.queryByTitle('Edit Access')).not.toBeInTheDocument();
        expect(accessHandler).not.toHaveBeenCalled();
        expect(deptAccessHandler).not.toHaveBeenCalled();
        expect(directoryHandler).toHaveBeenCalledTimes(1);
    });

    it('redirects to home when the user lacks any users-route entitlement', async () => {
        const accessHandler = vi.fn(() => HttpResponse.json([]));
        const deptAccessHandler = vi.fn(() => HttpResponse.json([]));
        const directoryHandler = vi.fn(() =>
            HttpResponse.json({ items: [], total: 0, skip: 0, limit: 50 })
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
                HttpResponse.json({ items: [], total: 0, skip: 0, limit: 50 })
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
