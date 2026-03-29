import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { UserNewPage } from '@/pages/UserNewPage';
import type { AuthConfigResponse } from '@/services/authApi';
import adminEn from '@/i18n/locales/en/admin.json';

const mockNavigate = vi.fn();
const mockGetAuthConfig = vi.fn();

function resolveAdminTranslation(key: string): string | undefined {
    return key.split('.').reduce<unknown>((current, part) => {
        if (current && typeof current === 'object' && part in current) {
            return (current as Record<string, unknown>)[part];
        }
        return undefined;
    }, adminEn) as string | undefined;
}

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        canManageUsers: true,
    }),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: { defaultValue?: string }) =>
            resolveAdminTranslation(key) ?? opts?.defaultValue ?? key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/authConfig', () => ({
    getAuthConfig: (...args: unknown[]) => mockGetAuthConfig(...args),
    clearAuthConfigCache: vi.fn(),
}));

vi.mock('@/services/userApi', () => ({
    userApi: {
        createUser: vi.fn(),
    },
}));

vi.mock('@/services/accessApi', () => ({
    accessApi: {
        listAccessRoles: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/services/departmentApi', () => ({
    departmentApi: {
        getDepartments: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/services/apiClient', () => ({
    apiClient: {
        toUiMessageKey: vi.fn().mockReturnValue('errorKeys.server'),
    },
}));

vi.mock('@/components/ui/ThemedSelect', () => ({
    ThemedSelect: () => <div data-testid="themed-select" />,
}));

vi.mock('@/components/users/DirectoryUserImportPanel', () => ({
    DirectoryUserImportPanel: ({
        onImported,
        onProviderUnavailableChange,
    }: {
        onImported: (result: { user_id: number; name: string }) => void;
        onProviderUnavailableChange?: (isUnavailable: boolean) => void;
    }) => (
        <div>
            <div>Directory import panel</div>
            <button type="button" onClick={() => onImported({ user_id: 42, name: 'Imported User' })}>
                Import user
            </button>
            <button type="button" onClick={() => onProviderUnavailableChange?.(true)}>
                Simulate provider unavailable
            </button>
        </div>
    ),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe('UserNewPage SSO mode', () => {
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
    });

    it('renders directory import flow and no password field in microsoft_sso mode', async () => {
        mockGetAuthConfig.mockResolvedValue(makeAuthConfig({ auth_mode: 'microsoft_sso' }));

        render(<UserNewPage />);

        await screen.findByText('Directory import panel');
        expect(document.querySelector('input[type="password"]')).toBeNull();
        expect(screen.queryByText(adminEn.user_new.directory_setup_hint_title)).not.toBeInTheDocument();
        expect(screen.queryByText(adminEn.user_new.directory_setup_hint_body)).not.toBeInTheDocument();
    });

    it('renders directory import flow and no password field in hybrid_dev mode', async () => {
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

        render(<UserNewPage />);

        await screen.findByText('Directory import panel');
        expect(document.querySelector('input[type="password"]')).toBeNull();
        expect(screen.getByText(adminEn.user_new.directory_setup_hint_title)).toBeInTheDocument();
        expect(screen.getByText(adminEn.user_new.directory_setup_hint_body)).toBeInTheDocument();
        expect(screen.getByText('SSO enabled by AUTH_MODE but missing ENTRA_TENANT_ID/ENTRA_CLIENT_ID')).toBeInTheDocument();
    });

    it('renders password form in password mode', async () => {
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

        render(<UserNewPage />);

        await waitFor(() => {
            expect(document.querySelector('input[type="password"]')).not.toBeNull();
        });
    });

    it('returns to /users with import context after successful directory import', async () => {
        mockGetAuthConfig.mockResolvedValue(makeAuthConfig({ auth_mode: 'microsoft_sso' }));

        render(<UserNewPage />);

        fireEvent.click(await screen.findByRole('button', { name: 'Import user' }));

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/users', {
                state: {
                    importedUserId: 42,
                    importedUserName: 'Imported User',
                },
            });
        });
    });

    it('shows setup guidance when panel reports provider unavailable', async () => {
        mockGetAuthConfig.mockResolvedValue(
            makeAuthConfig({
                auth_mode: 'hybrid_dev',
                demo_login_enabled: true,
                password_login_enabled: true,
                sso: {
                    enabled: true,
                    provider: 'entra',
                    tenant_id: 'tenant',
                    client_id: 'client',
                    authority: 'https://login.microsoftonline.com/tenant',
                    scopes: ['openid', 'profile', 'email'],
                },
                sso_error: null,
            })
        );

        render(<UserNewPage />);

        fireEvent.click(await screen.findByRole('button', { name: 'Simulate provider unavailable' }));
        expect(screen.getByText(adminEn.user_new.directory_setup_hint_title)).toBeInTheDocument();
        expect(screen.getByText(adminEn.user_new.directory_setup_hint_body)).toBeInTheDocument();
    });
});
