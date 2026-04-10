import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { AuthProviderWithReady, waitForAuthBootstrapReady } from '@test/authBootstrap';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { clearBootstrapSession } from '@/services/session/bootstrap';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { UserLifecycleRouteGuard, UsersRouteGuard } from '@/authz/BusinessRouteGuards';
import { UsersPage } from '@/pages/UsersPage';
import { UserNewPage } from '@/pages/UserNewPage';

const mockGetAuthConfig = vi.fn();

vi.mock('@/utils/userSettingsStorage', async () => {
    const actual = await vi.importActual<typeof import('@/utils/userSettingsStorage')>('@/utils/userSettingsStorage');
    return {
        ...actual,
        syncPreferencesFromServer: vi.fn(async () => undefined),
        clearLocalSettings: vi.fn(),
    };
});

vi.mock('@/services/authConfig', () => ({
    getAuthConfig: (...args: unknown[]) => mockGetAuthConfig(...args),
    clearAuthConfigCache: vi.fn(),
}));

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

async function renderUsersRoute(route = '/users') {
    const queryClient = createTestQueryClient();

    render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[route]}>
                <AuthProviderWithReady>
                    <DashboardFilterProvider>
                        <Routes>
                            <Route path="/" element={<div>Home route</div>} />
                            <Route
                                path="/users"
                                element={
                                    <UsersRouteGuard>
                                        <UsersPage />
                                    </UsersRouteGuard>
                                }
                            />
                        </Routes>
                    </DashboardFilterProvider>
                </AuthProviderWithReady>
            </MemoryRouter>
        </QueryClientProvider>
    );

    await waitForAuthBootstrapReady();
}

async function renderUserNewRoute(route = '/users/new') {
    const queryClient = createTestQueryClient();

    render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[route]}>
                <AuthProviderWithReady>
                    <Routes>
                        <Route path="/" element={<div>Home route</div>} />
                        <Route
                            path="/users/new"
                            element={
                                <UserLifecycleRouteGuard>
                                    <UserNewPage />
                                </UserLifecycleRouteGuard>
                            }
                        />
                    </Routes>
                </AuthProviderWithReady>
            </MemoryRouter>
        </QueryClientProvider>
    );

    await waitForAuthBootstrapReady();
}

describe('users route guards', () => {
    beforeEach(() => {
        clearBootstrapSession();
        setAccessToken('test-token');
        mockGetAuthConfig.mockReset();
        mockGetAuthConfig.mockResolvedValue({
            auth_mode: 'password',
            demo_login_enabled: true,
            password_login_enabled: true,
            sso: {
                enabled: false,
                provider: 'entra',
                tenant_id: null,
                client_id: null,
                authority: null,
                scopes: ['openid', 'profile', 'email'],
            },
            sso_error: null,
        });
    });

    afterEach(() => {
        clearAccessToken();
        clearBootstrapSession();
    });

    it('redirects denied /users visits before UsersPage mounts or loads auth config', async () => {
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
            )
        );

        await renderUsersRoute();

        await waitFor(() => {
            expect(screen.getByText('Home route')).toBeInTheDocument();
        });
        expect(mockGetAuthConfig).not.toHaveBeenCalled();
    });

    it('redirects denied /users/new visits before UserNewPage mounts or loads auth config', async () => {
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
            )
        );

        await renderUserNewRoute();

        await waitFor(() => {
            expect(screen.getByText('Home route')).toBeInTheDocument();
        });
        expect(mockGetAuthConfig).not.toHaveBeenCalled();
    });
});
