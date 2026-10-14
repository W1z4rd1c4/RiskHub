import type * as MockauthConfigModule from '@/services/authConfig';
import type * as MockuserApiModule from '@/services/userApi';
import type * as MockuserDirectoryApiModule from '@/services/userDirectoryApi';
import type * as MockaccessApiModule from '@/services/accessApi';
import type * as MockdepartmentApiModule from '@/services/departmentApi';
import type * as Actualreactrouterdom from 'react-router-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderInRouter as render } from '@test/render';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { UserNewPage } from '@/pages/UserNewPage';
import type { AuthConfigResponse } from '@/services/authApi';
import adminEn from '@/i18n/locales/en/admin.json';

const mockNavigate = vi.fn();
const mockGetAuthConfig = vi.fn<typeof MockauthConfigModule.getAuthConfig>();
const mockListDirectoryUsers = vi.fn<typeof MockuserDirectoryApiModule.userDirectoryApi.listDirectoryUsers>();
const mockCreateUser = vi.fn<typeof MockuserApiModule.userApi.createUser>();
const mockListAccessRoles = vi.fn<typeof MockaccessApiModule.accessApi.listAccessRoles>();
const mockGetDepartments = vi.fn<typeof MockdepartmentApiModule.departmentApi.getDepartments>();

function resolveAdminTranslation(key: string): string | undefined {
    return key.split('.').reduce<unknown>((current, part) => {
        if (current && typeof current === 'object' && part in current) {
            return (current as Record<string, unknown>)[part];
        }
        return undefined;
    }, adminEn) as string | undefined;
}


function translateAdmin(key: string, opts?: { defaultValue?: string }) {
    return resolveAdminTranslation(key) ?? opts?.defaultValue ?? key;
}

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: translateAdmin,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/authConfig', () => ({
    getAuthConfig: (...args: Parameters<typeof mockGetAuthConfig>) => mockGetAuthConfig(...args),
    clearAuthConfigCache: vi.fn(),
}));

vi.mock('@/services/userApi', () => ({
    userApi: {
        createUser: (...args: Parameters<typeof mockCreateUser>) => mockCreateUser(...args),
    },
}));

vi.mock('@/services/userDirectoryApi', () => ({
    userDirectoryApi: {
        listDirectoryUsers: (...args: Parameters<typeof mockListDirectoryUsers>) => mockListDirectoryUsers(...args),
    },
}));

vi.mock('@/services/accessApi', () => ({
    accessApi: {
        listAccessRoles: (...args: Parameters<typeof mockListAccessRoles>) => mockListAccessRoles(...args),
    },
}));

vi.mock('@/services/departmentApi', () => ({
    departmentApi: {
        getDepartments: (...args: Parameters<typeof mockGetDepartments>) => mockGetDepartments(...args),
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
    const actual = await vi.importActual<typeof Actualreactrouterdom>('react-router-dom');
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
        strict_capabilities: true,
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
        mockListDirectoryUsers.mockReset();
        mockCreateUser.mockReset();
        mockListAccessRoles.mockReset();
        mockGetDepartments.mockReset();
        mockCreateUser.mockResolvedValue({ id: 1, name: 'New user', email: 'new@example.test', is_active: true, role: { id: 1, name: 'employee', display_name: 'Employee', description: null }, department_id: null, manager_id: null, manager_name: null, created_at: '2026-07-15T10:00:00Z', updated_at: '2026-07-15T10:00:00Z' });
        mockListAccessRoles.mockResolvedValue([]);
        mockGetDepartments.mockResolvedValue([]);
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

    it('uses a safe default role and submits local-user payload in password mode', async () => {
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
        mockListAccessRoles.mockResolvedValue([
            { id: 1, name: 'admin', display_name: 'Admin', description: null, permissions: [] },
            { id: 2, name: 'control_owner', display_name: 'Control Owner', description: null, permissions: [] },
        ]);
        mockGetDepartments.mockResolvedValue([{ id: 9, name: 'Operations', code: 'OPS', user_count: 0, risk_count: 0, high_risk_count: 0, control_count: 0, kri_count: 0, breaching_kri_count: 0, total_net_score: 0 }]);

        render(<UserNewPage />);

        await waitFor(() => {
            expect(document.querySelector('input[type="password"]')).not.toBeNull();
        });
        await waitFor(() => {
            expect(mockListAccessRoles).toHaveBeenCalledTimes(1);
            expect(mockGetDepartments).toHaveBeenCalledTimes(1);
        });
        const inputs = document.querySelectorAll('input');
        fireEvent.change(inputs[0], {
            target: { value: 'New User' },
        });
        fireEvent.change(inputs[1], {
            target: { value: 'new.user@riskhub.test' },
        });
        fireEvent.change(inputs[2], {
            target: { value: 's3cret-value' },
        });
        fireEvent.click(screen.getByRole('button', { name: adminEn.users.create_user }));

        await waitFor(() => {
            expect(mockCreateUser).toHaveBeenCalledWith({
                email: 'new.user@riskhub.test',
                name: 'New User',
                password: 's3cret-value',
                role_id: 2,
                department_id: null,
                manager_id: null,
                is_active: true,
            });
        });
        expect(mockNavigate).toHaveBeenCalledWith('/users');
    });

    it('hides creation actions when directory capabilities are absent', async () => {
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
        mockListDirectoryUsers.mockResolvedValue({
            items: [],
            available_roles: [],
            total: 0,
            skip: 0,
            limit: 1,
            capabilities: null,
        });

        render(<UserNewPage />);

        await waitFor(() => {
            expect(document.querySelector('input[type="password"]')).toBeNull();
        });
        expect(screen.getByText('access.denied')).toBeInTheDocument();
    });

    it('renders an auth-config load failure as one error with retry, not as access denied (SM-07)', async () => {
        mockGetAuthConfig
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValueOnce(makeAuthConfig({ auth_mode: 'microsoft_sso' }));

        render(<UserNewPage />);

        expect(await screen.findByRole('alert')).toHaveTextContent(adminEn.user_new.auth_mode_load_failed);
        expect(screen.queryByText('access.denied')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: adminEn.native_users.retry }));

        await screen.findByText('Directory import panel');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(mockGetAuthConfig).toHaveBeenCalledTimes(2);
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
