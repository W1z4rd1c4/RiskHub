import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { UsersPage } from '@/pages/UsersPage';
import type { AuthConfigResponse } from '@/services/authApi';

const mockNavigate = vi.fn();
const mockGetAuthConfig = vi.fn();
const mockListAccessUsers = vi.fn();
const mockListDirectoryUsers = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            id: 1,
            name: 'Admin',
            email: 'admin@example.test',
            role: 'admin',
            access_scope: 'global',
            effective_permissions: ['users:read', 'users:write'],
        },
        hasPermission: () => true,
        isLoading: false,
        isPreferencesHydrated: true,
    }),
}));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({
        canViewAccessUsers: true,
        canViewDepartmentAccessUsers: false,
        canViewUserDirectory: true,
        canManageAccess: true,
        canEditAccessUsers: true,
        isDepartmentHead: false,
        isPlatformAdmin: true,
    }),
}));

vi.mock('@/services/authConfig', () => ({
    getAuthConfig: (...args: unknown[]) => mockGetAuthConfig(...args),
    clearAuthConfigCache: vi.fn(),
}));

vi.mock('@/services/accessApi', () => ({
    accessApi: {
        listAccessUsers: (...args: unknown[]) => mockListAccessUsers(...args),
        listDepartmentAccessUsers: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/services/adminApi', () => ({
    adminApi: {
        checkAllDirectoryUsers: vi.fn(),
        checkDirectoryUser: vi.fn(),
    },
}));

vi.mock('@/services/userApi', () => ({
    userApi: {
        listVisibleUsers: vi.fn().mockResolvedValue([]),
        updateUser: vi.fn(),
    },
}));

vi.mock('@/services/userDirectoryApi', () => ({
    userDirectoryApi: {
        listDirectoryUsers: (...args: unknown[]) => mockListDirectoryUsers(...args),
    },
}));

vi.mock('@/components/access/UsersFilterBar', () => ({
    UsersFilterBar: () => <div data-testid="users-filter-bar" />,
}));

vi.mock('@/components/access/UsersTable', () => ({
    UsersTable: () => <div data-testid="users-table" />,
}));

vi.mock('@/components/access/AccessEditModal', () => ({
    AccessEditModal: () => null,
}));

vi.mock('@/components/ConfirmDialog', () => ({
    ConfirmDialog: () => null,
}));

vi.mock('@/components/users/ADUserPicker', () => ({
    ADUserPicker: () => null,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe('UsersPage SSO add CTA', () => {
    const makeAuthConfig = (overrides: Partial<AuthConfigResponse>): AuthConfigResponse => ({
        auth_mode: 'microsoft_sso',
        demo_login_enabled: false,
        password_login_enabled: false,
        sso: {
            enabled: true,
            provider: 'entra',
            tenant_id: 'tenant',
            client_id: 'client',
            authority: 'https://login.microsoftonline.com/tenant',
            scopes: ['openid', 'profile', 'email'],
        },
        sso_error: null,
        ...overrides,
    });

    beforeEach(() => {
        mockNavigate.mockReset();
        mockGetAuthConfig.mockReset();
        mockListAccessUsers.mockReset();
        mockListDirectoryUsers.mockReset();
        mockListAccessUsers.mockResolvedValue([]);
        mockListDirectoryUsers.mockResolvedValue({
            items: [],
            available_roles: [],
            total: 0,
            skip: 0,
            limit: 1,
            capabilities: {
                can_read_directory: true,
                can_view_access_details: true,
                can_use_role_facets: true,
                can_create_local_user: true,
                can_import_directory_user: true,
            },
        });
    });

    function renderPage() {
        render(
            <MemoryRouter initialEntries={['/users']}>
                <UsersPage />
            </MemoryRouter>
        );
    }

    it('shows a single AD add flow CTA in microsoft_sso mode', async () => {
        mockGetAuthConfig.mockResolvedValue(makeAuthConfig({ auth_mode: 'microsoft_sso' }));

        renderPage();

        await waitFor(() => {
            expect(mockListAccessUsers).toHaveBeenCalled();
        });

        const ssoAddButton = await screen.findByRole('button', { name: 'Add from AD' });
        fireEvent.click(ssoAddButton);

        expect(mockNavigate).toHaveBeenCalledWith('/users/new');
        expect(screen.queryByRole('button', { name: 'access.add_user' })).not.toBeInTheDocument();
    });

    it('shows a single AD add flow CTA in hybrid_dev mode', async () => {
        mockGetAuthConfig.mockResolvedValue(
            makeAuthConfig({
                auth_mode: 'hybrid_dev',
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
                sso_error: 'SSO enabled by AUTH_MODE but missing ENTRA_TENANT_ID/ENTRA_CLIENT_ID',
            })
        );

        renderPage();

        await waitFor(() => {
            expect(mockListAccessUsers).toHaveBeenCalled();
        });

        const ssoAddButton = await screen.findByRole('button', { name: 'Add from AD' });
        fireEvent.click(ssoAddButton);

        expect(mockNavigate).toHaveBeenCalledWith('/users/new');
        expect(screen.queryByRole('button', { name: 'access.add_user' })).not.toBeInTheDocument();
    });

    it('keeps the password create CTA only in password mode', async () => {
        mockGetAuthConfig.mockResolvedValue(
            makeAuthConfig({
                auth_mode: 'password',
                password_login_enabled: true,
                sso: {
                    enabled: false,
                    provider: 'entra',
                    tenant_id: null,
                    client_id: null,
                    authority: null,
                    scopes: ['openid', 'profile', 'email'],
                },
            })
        );

        renderPage();

        await waitFor(() => {
            expect(mockListAccessUsers).toHaveBeenCalled();
        });

        expect(await screen.findByRole('button', { name: 'access.add_user' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add from AD' })).not.toBeInTheDocument();
    });

    it('keeps the list visible but disables auth-mode actions when auth config is unavailable', async () => {
        mockGetAuthConfig.mockRejectedValue(new Error('Auth service unavailable'));

        renderPage();

        await waitFor(() => {
            expect(mockListAccessUsers).toHaveBeenCalled();
        });

        expect(screen.getByTestId('users-table')).toBeInTheDocument();
        expect(screen.getByText(/create and directory actions are disabled/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add from AD' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'access.add_user' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Check AD' })).not.toBeInTheDocument();
    });

    it('hides auth-mode actions when directory capabilities are unavailable', async () => {
        mockGetAuthConfig.mockResolvedValue(makeAuthConfig({ auth_mode: 'microsoft_sso' }));
        mockListDirectoryUsers.mockResolvedValue({
            items: [],
            available_roles: [],
            total: 0,
            skip: 0,
            limit: 1,
            capabilities: null,
        });

        renderPage();

        await waitFor(() => {
            expect(mockListAccessUsers).toHaveBeenCalled();
        });
        await waitFor(() => {
            expect(mockListDirectoryUsers).toHaveBeenCalled();
        });

        expect(screen.queryByRole('button', { name: 'Add from AD' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Check AD' })).not.toBeInTheDocument();
    });
});
