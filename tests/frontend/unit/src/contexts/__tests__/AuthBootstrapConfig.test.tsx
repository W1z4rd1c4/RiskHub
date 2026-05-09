import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/services/authApi';
import type { AuthConfigResponse, AuthUser } from '@/services/authApi';
import {
    __resetAuthSessionCoordinatorForTests,
    clearBootstrapSession,
    setBootstrapSession,
} from '@/services/session/coordinator';
import { syncAuthenticatedToken } from '@/services/session/coordinator';
import { __resetSessionStoreForTests } from '@/services/session/store';

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

describe('AuthProvider config bootstrap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetAuthSessionCoordinatorForTests();
        __resetSessionStoreForTests();
        clearBootstrapSession();
    });

    afterEach(() => {
        vi.clearAllMocks();
        __resetAuthSessionCoordinatorForTests();
        __resetSessionStoreForTests();
        clearBootstrapSession();
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

    it('waits for auth config before applying the bootstrapped session', async () => {
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
                <AuthProbe />
            </AuthProvider>,
        );

        await waitFor(() => expect(getAuthConfigMock).toHaveBeenCalledTimes(1));
        expect(screen.getByTestId('loading')).toHaveTextContent('loading');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('no');

        await act(async () => {
            resolveConfig(authConfig);
        });

        await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('yes'));
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });

    it('keeps a valid session when auth config loading fails', async () => {
        getAuthConfigMock.mockRejectedValue(new Error('config unavailable'));
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
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });
});
