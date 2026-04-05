import { useCallback } from 'react';
import type { AuthUser, TokenResponse } from '@/services/authApi';
import { authApi } from '@/services/authApi';
import { getAuthConfig } from '@/services/authConfig';
import { AuthRequestError } from '@/services/authRequest';
import { entraAuth } from '@/services/entraAuth';
import { clearExplicitLogoutSuppressed, setExplicitLogoutSuppressed } from '@/services/logoutSuppression';
import { applyAuthenticatedSession, clearAuthenticatedSession } from '@/services/sessionManager';
import { clearLocalSettings } from '@/utils/userSettingsStorage';

interface UseAuthActionsOptions {
    hydratePreferences: () => Promise<void>;
    markPreferencesReady: (ready: boolean) => void;
    setUser: (user: AuthUser | null) => void;
    setBootstrapStatus: (status: 'loading' | 'authenticated' | 'anonymous' | 'error') => void;
    setBootstrapError: (error: 'service_unavailable' | null) => void;
    setLogoutPending: (pending: boolean) => void;
    setLogoutErrorKey: (errorKey: string | null) => void;
}

interface UseAuthActionsResult {
    login: (email: string, password: string) => Promise<AuthUser>;
    logout: () => Promise<void>;
}

export function useAuthActions({
    hydratePreferences,
    markPreferencesReady,
    setUser,
    setBootstrapStatus,
    setBootstrapError,
    setLogoutPending,
    setLogoutErrorKey,
}: UseAuthActionsOptions): UseAuthActionsResult {
    const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
        clearExplicitLogoutSuppressed();
        setLogoutErrorKey(null);

        try {
            const response: TokenResponse = await authApi.login({ email, password });
            applyAuthenticatedSession(response);
            setUser(response.user);
            setBootstrapStatus('authenticated');
            setBootstrapError(null);
            await hydratePreferences();
            return response.user;
        } catch (err) {
            throw new Error(err instanceof Error ? err.message : 'Login failed', { cause: err });
        }
    }, [hydratePreferences, setBootstrapError, setBootstrapStatus, setLogoutErrorKey, setUser]);

    const logout = useCallback(async () => {
        setLogoutPending(true);
        setLogoutErrorKey(null);
        setExplicitLogoutSuppressed();

        const authConfig = await getAuthConfig().catch(() => null);
        const shouldUseSsoLogout = authConfig?.auth_mode === 'microsoft_sso';

        try {
            await authApi.logout();
        } catch (error) {
            clearExplicitLogoutSuppressed();
            setLogoutPending(false);
            setLogoutErrorKey(
                error instanceof AuthRequestError && typeof error.status === 'number' && error.status >= 500
                    ? 'errorKeys.server'
                    : 'errorKeys.logout_failed',
            );
            throw error;
        }

        clearAuthenticatedSession({
            clearBootstrap: true,
            clearRefreshHint: true,
            clearCsrf: true,
        });
        clearLocalSettings();
        setUser(null);
        setBootstrapStatus('anonymous');
        setBootstrapError(null);
        markPreferencesReady(true);
        setLogoutPending(false);

        if (shouldUseSsoLogout) {
            try {
                await entraAuth.logoutRedirect();
            } catch (error) {
                console.error(error);
            }
        }
    }, [
        markPreferencesReady,
        setBootstrapError,
        setBootstrapStatus,
        setLogoutErrorKey,
        setLogoutPending,
        setUser,
    ]);

    return { login, logout };
}
