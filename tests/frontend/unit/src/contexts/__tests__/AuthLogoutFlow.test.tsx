import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { clearAuthConfigCache } from '@/services/authConfig';
import { clearBootstrapSession } from '@/services/session/bootstrap';
import { clearAccessToken, getAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { clearCsrfToken, __setCsrfTokenForTests } from '@/services/csrfToken';
import { __resetExplicitLogoutSuppressionForTests, isExplicitLogoutSuppressed } from '@/services/session/logoutSuppression';
import { clearRefreshSessionHint, __setRefreshSessionHintForTests } from '@/services/session/refreshHint';

const logoutRedirectMock = vi.fn();
const clearLocalSettingsMock = vi.fn();

vi.mock('@/services/entraAuth', () => ({
    entraAuth: {
        logoutRedirect: (...args: unknown[]) => logoutRedirectMock(...args),
    },
}));

vi.mock('@/utils/userSettingsStorage', () => ({
    syncPreferencesFromServer: vi.fn(async () => ({ theme: 'riskhub', language: 'en' })),
    clearLocalSettings: () => clearLocalSettingsMock(),
}));

function AuthHarness() {
    const { isLoading, user, logout, logoutPending, logoutErrorKey } = useAuth();

    if (isLoading) {
        return <div>loading</div>;
    }

    return (
        <div>
            <div data-testid="auth-user">{user?.email ?? 'anonymous'}</div>
            <div data-testid="logout-pending">{logoutPending ? 'pending' : 'idle'}</div>
            <div data-testid="logout-error">{logoutErrorKey ?? 'none'}</div>
            <button
                onClick={() => {
                    void logout().catch(() => undefined);
                }}
                type="button"
            >
                logout
            </button>
        </div>
    );
}

function authConfigResponse(authMode: 'password' | 'microsoft_sso' | 'hybrid_dev') {
    return {
        auth_mode: authMode,
        demo_login_enabled: false,
        password_login_enabled: authMode !== 'microsoft_sso',
        sso: {
            enabled: authMode === 'microsoft_sso',
            provider: 'entra',
            authority: authMode === 'microsoft_sso' ? 'https://login.microsoftonline.com/tenant' : null,
            client_id: authMode === 'microsoft_sso' ? 'client-id' : null,
            scopes: ['openid', 'profile', 'email'],
        },
        sso_error: null,
    };
}

describe('AuthProvider logout flow', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        clearAccessToken();
        clearBootstrapSession();
        clearAuthConfigCache();
        clearCsrfToken();
        clearRefreshSessionHint();
        __resetExplicitLogoutSuppressionForTests();
        logoutRedirectMock.mockReset();
        clearLocalSettingsMock.mockReset();
    });

    afterEach(() => {
        clearAccessToken();
        clearBootstrapSession();
        clearAuthConfigCache();
        clearCsrfToken();
        clearRefreshSessionHint();
        __resetExplicitLogoutSuppressionForTests();
    });

    it('clears local auth state when backend logout fails', async () => {
        setAccessToken('active-token');

        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.endsWith('/api/v1/auth/me')) {
                return Promise.resolve(new Response(JSON.stringify({
                    id: 1,
                    email: 'admin@riskhub.local',
                    name: 'System Admin',
                    role: 'administrator',
                    role_display_name: 'Administrator',
                    permissions: [],
                    effective_permissions: [],
                    access_scope: 'global',
                    scope_label: 'Global',
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }
            if (url.endsWith('/api/v1/auth/config')) {
                return Promise.resolve(new Response(JSON.stringify(authConfigResponse('password')), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }
            if (url.endsWith('/api/v1/auth/csrf')) {
                __setCsrfTokenForTests('logout-failure-csrf-token');
                return Promise.resolve(new Response(null, { status: 204 }));
            }
            if (url.endsWith('/api/v1/auth/logout')) {
                return Promise.resolve(new Response(JSON.stringify({ detail: 'Logout failed' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }
            throw new Error(`Unexpected fetch call: ${url}`);
        });

        render(
            <AuthProvider>
                <AuthHarness />
            </AuthProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('auth-user')).toHaveTextContent('admin@riskhub.local'));

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'logout' }));
            await Promise.resolve();
        });

        await waitFor(() => expect(screen.getByTestId('logout-error')).toHaveTextContent('errorKeys.server'));
        expect(screen.getByTestId('auth-user')).toHaveTextContent('anonymous');
        expect(screen.getByTestId('logout-pending')).toHaveTextContent('idle');
        expect(getAccessToken()).toBeNull();
        expect(isExplicitLogoutSuppressed()).toBe(true);
        expect(clearLocalSettingsMock).toHaveBeenCalledTimes(1);
        expect(logoutRedirectMock).not.toHaveBeenCalled();
    });

    it('clears local auth state and triggers SSO logout redirect after backend success', async () => {
        setAccessToken('active-token');
        __setRefreshSessionHintForTests();
        __setCsrfTokenForTests('existing-csrf-token');

        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.endsWith('/api/v1/auth/me')) {
                return Promise.resolve(new Response(JSON.stringify({
                    id: 1,
                    email: 'admin@riskhub.local',
                    name: 'System Admin',
                    role: 'administrator',
                    role_display_name: 'Administrator',
                    permissions: [],
                    effective_permissions: [],
                    access_scope: 'global',
                    scope_label: 'Global',
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }
            if (url.endsWith('/api/v1/auth/config')) {
                return Promise.resolve(new Response(JSON.stringify(authConfigResponse('microsoft_sso')), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }
            if (url.endsWith('/api/v1/auth/logout')) {
                return Promise.resolve(new Response(JSON.stringify({ message: 'Logged out successfully' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }
            throw new Error(`Unexpected fetch call: ${url}`);
        });

        render(
            <AuthProvider>
                <AuthHarness />
            </AuthProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('auth-user')).toHaveTextContent('admin@riskhub.local'));

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'logout' }));
            await Promise.resolve();
        });

        await waitFor(() => expect(screen.getByTestId('auth-user')).toHaveTextContent('anonymous'));
        expect(screen.getByTestId('logout-error')).toHaveTextContent('none');
        expect(getAccessToken()).toBeNull();
        expect(document.cookie).not.toContain('riskhub_refresh_hint=1');
        expect(document.cookie).not.toContain('riskhub_csrf_token=');
        expect(isExplicitLogoutSuppressed()).toBe(true);
        expect(clearLocalSettingsMock).toHaveBeenCalledTimes(1);
        expect(logoutRedirectMock).toHaveBeenCalledTimes(1);
    });

    it('keeps the user logged out and surfaces an SSO logout recovery error when redirect launch fails', async () => {
        setAccessToken('active-token');
        __setRefreshSessionHintForTests();
        __setCsrfTokenForTests('existing-csrf-token');
        logoutRedirectMock.mockRejectedValueOnce(new Error('redirect failed'));

        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.endsWith('/api/v1/auth/me')) {
                return Promise.resolve(new Response(JSON.stringify({
                    id: 1,
                    email: 'admin@riskhub.local',
                    name: 'System Admin',
                    role: 'administrator',
                    role_display_name: 'Administrator',
                    permissions: [],
                    effective_permissions: [],
                    access_scope: 'global',
                    scope_label: 'Global',
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }
            if (url.endsWith('/api/v1/auth/config')) {
                return Promise.resolve(new Response(JSON.stringify(authConfigResponse('microsoft_sso')), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }
            if (url.endsWith('/api/v1/auth/logout')) {
                return Promise.resolve(new Response(JSON.stringify({ message: 'Logged out successfully' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }
            throw new Error(`Unexpected fetch call: ${url}`);
        });

        render(
            <AuthProvider>
                <AuthHarness />
            </AuthProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('auth-user')).toHaveTextContent('admin@riskhub.local'));

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'logout' }));
            await Promise.resolve();
        });

        await waitFor(() => expect(screen.getByTestId('auth-user')).toHaveTextContent('anonymous'));
        await waitFor(() => expect(screen.getByTestId('logout-error')).toHaveTextContent('errorKeys.sso_logout_incomplete'));
        expect(getAccessToken()).toBeNull();
        expect(isExplicitLogoutSuppressed()).toBe(true);
        expect(logoutRedirectMock).toHaveBeenCalledTimes(1);
    });
});
