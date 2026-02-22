import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UsersPage } from '@/pages/UsersPage';
import type { AuthConfigResponse } from '@/services/authApi';

const mockNavigate = vi.fn();
const mockGetAuthConfig = vi.fn();
const mockListAccessUsers = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    }),
}));

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        canManageUsers: true,
        user: { id: 1, name: 'Admin' },
    }),
}));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({
        canManageAccess: true,
        canEditAccessUsers: true,
        isDepartmentHead: false,
        isPlatformAdmin: false,
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
        mockListAccessUsers.mockResolvedValue([]);
    });

    it('shows a single AD add flow CTA in microsoft_sso mode', async () => {
        mockGetAuthConfig.mockResolvedValue(makeAuthConfig({ auth_mode: 'microsoft_sso' }));

        render(<UsersPage />);

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

        render(<UsersPage />);

        await waitFor(() => {
            expect(mockListAccessUsers).toHaveBeenCalled();
        });

        const ssoAddButton = await screen.findByRole('button', { name: 'Add from AD' });
        fireEvent.click(ssoAddButton);

        expect(mockNavigate).toHaveBeenCalledWith('/users/new');
        expect(screen.queryByRole('button', { name: 'access.add_user' })).not.toBeInTheDocument();
    });

    it('keeps password-mode CTAs in password mode', async () => {
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

        render(<UsersPage />);

        await waitFor(() => {
            expect(mockListAccessUsers).toHaveBeenCalled();
        });

        expect(await screen.findByRole('button', { name: 'Add from AD' })).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: 'access.add_user' })).toBeInTheDocument();
    });
});
