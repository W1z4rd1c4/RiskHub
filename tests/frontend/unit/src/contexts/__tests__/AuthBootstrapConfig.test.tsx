import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from '@/App';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/services/authApi';
import type { AuthConfigResponse, AuthUser } from '@/services/authApi';
import { AuthRequestError } from '@/services/authRequest';
import {
    __resetAuthSessionCoordinatorForTests,
    clearBootstrapSession,
    setBootstrapSession,
} from '@/services/session/coordinator';
import {
    __setRefreshSessionHintForTests,
    clearRefreshSessionHint,
} from '@/services/session/sessionStorage';
import { syncAuthenticatedToken } from '@/services/session/coordinator';
import { __resetSessionStoreForTests, getSessionSnapshot } from '@/services/session/store';

const { getAuthConfigMock, syncPreferencesFromServerMock } = vi.hoisted(() => ({
    getAuthConfigMock: vi.fn(),
    syncPreferencesFromServerMock: vi.fn(async () => undefined),
}));

vi.mock('@/services/authConfig', () => ({
    getAuthConfig: getAuthConfigMock,
    clearAuthConfigCache: vi.fn(),
}));

vi.mock('@/utils/userSettingsStorage', () => ({
    syncPreferencesFromServer: syncPreferencesFromServerMock,
    clearLocalSettings: vi.fn(),
}));

const authConfig: AuthConfigResponse = {
    auth_mode: 'hybrid_dev',
    demo_login_enabled: true,
    password_login_enabled: true,
    strict_capabilities: false,
    sso: {
        enabled: false,
        provider: 'entra',
        scopes: [],
    },
};

const user: AuthUser = {
    id: 123,
    email: 'test.user@riskhub.test',
    name: 'Test User',
    role: 'employee',
    role_display_name: 'Employee',
    permissions: [],
    effective_permissions: ['risks:read'],
    access_scope: 'department',
    scope_label: 'dept',
};

function AuthProbe() {
    const { isAuthenticated, isLoading } = useAuth();

    return (
        <div>
            <div data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
        </div>
    );
}

function ProtectedProbe() {
    return (
        <MemoryRouter initialEntries={['/protected']}>
            <Routes>
                <Route
                    path="/protected"
                    element={(
                        <ProtectedRoute>
                            <div>Protected content</div>
                        </ProtectedRoute>
                    )}
                />
                <Route path="/login" element={<div>Login page</div>} />
            </Routes>
        </MemoryRouter>
    );
}

describe('AuthProvider config bootstrap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetAuthSessionCoordinatorForTests();
        __resetSessionStoreForTests();
        clearBootstrapSession();
        clearRefreshSessionHint();
    });

    afterEach(() => {
        vi.clearAllMocks();
        __resetAuthSessionCoordinatorForTests();
        __resetSessionStoreForTests();
        clearBootstrapSession();
        clearRefreshSessionHint();
    });

    it('loads auth config during initial session bootstrap', async () => {
        getAuthConfigMock.mockResolvedValue(authConfig);
        act(() => {
            setBootstrapSession({ token: 'session-token', user });
        });

        render(
            <AuthProvider>
                <AuthProbe />
            </AuthProvider>,
        );

        await waitFor(() => expect(getAuthConfigMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('yes'));
    });

    it('starts config and session concurrently but keeps protected content blocked until config settles', async () => {
        let resolveConfig: (config: AuthConfigResponse) => void = () => undefined;
        getAuthConfigMock.mockImplementation(
            () => new Promise<AuthConfigResponse>((resolve) => {
                resolveConfig = resolve;
            }),
        );
        act(() => {
            syncAuthenticatedToken('session-token');
        });
        vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(user);

        render(
            <AuthProvider>
                <ProtectedProbe />
            </AuthProvider>,
        );

        await waitFor(() => expect(getAuthConfigMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(authApi.getCurrentUser).toHaveBeenCalledWith('session-token'));
        expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
        expect(screen.getByText(/loading/i)).toBeInTheDocument();

        await act(async () => {
            resolveConfig(authConfig);
        });
        await waitFor(() => expect(screen.getByText('Protected content')).toBeInTheDocument());
    });

    it('keeps a refresh-hint session behind the config gate and fails closed when config rejects', async () => {
        let rejectConfig: (error: unknown) => void = () => undefined;
        getAuthConfigMock.mockImplementation(
            () => new Promise<AuthConfigResponse>((_resolve, reject) => {
                rejectConfig = reject;
            }),
        );
        __setRefreshSessionHintForTests();
        act(() => {
            __resetSessionStoreForTests();
        });
        vi.spyOn(authApi, 'refresh').mockResolvedValue({
            access_token: 'refreshed-token',
            token_type: 'bearer',
            user,
        });

        render(
            <AuthProvider>
                <ProtectedProbe />
            </AuthProvider>,
        );

        await waitFor(() => expect(authApi.refresh).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(getSessionSnapshot().user).toEqual(user));
        expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
        expect(screen.getByText(/loading/i)).toBeInTheDocument();

        await act(async () => {
            rejectConfig(new AuthRequestError({
                code: 'AUTH_SERVICE_UNAVAILABLE',
                message: 'config unavailable',
            }));
        });

        await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
        expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
        expect(getSessionSnapshot().user).toBeNull();
    });

    it('fails closed without exposing protected content when auth config is unavailable', async () => {
        getAuthConfigMock.mockRejectedValue(new AuthRequestError({
            code: 'AUTH_SERVICE_UNAVAILABLE',
            message: 'config unavailable',
        }));
        act(() => {
            setBootstrapSession({ token: 'session-token', user });
        });

        render(
            <AuthProvider>
                <ProtectedProbe />
            </AuthProvider>,
        );

        await waitFor(() => expect(getAuthConfigMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
        expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    });
});
