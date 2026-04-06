import { useCallback } from 'react';
import type { AuthUser, TokenResponse } from '@/services/authApi';
import { authApi } from '@/services/authApi';
import { getAuthConfig } from '@/services/authConfig';
import { AuthRequestError } from '@/services/authRequest';
import { entraAuth } from '@/services/entraAuth';
import { clearExplicitLogoutSuppressed, setExplicitLogoutSuppressed } from '@/services/logoutSuppression';
import {
    applyAuthenticatedSession,
    clearAuthenticatedSession,
    setLogoutErrorState,
    setLogoutPendingState,
} from '@/services/sessionManager';
import { clearLocalSettings } from '@/utils/userSettingsStorage';

interface UseAuthActionsOptions {
    hydratePreferences: () => Promise<void>;
    markPreferencesReady: (ready: boolean) => void;
}

interface UseAuthActionsResult {
    login: (email: string, password: string) => Promise<AuthUser>;
    logout: () => Promise<void>;
}

export function useAuthActions({
    hydratePreferences,
    markPreferencesReady,
}: UseAuthActionsOptions): UseAuthActionsResult {
    const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
        clearExplicitLogoutSuppressed();
        setLogoutErrorState(null);

        try {
            const response: TokenResponse = await authApi.login({ email, password });
            applyAuthenticatedSession(response);
            await hydratePreferences();
            return response.user;
        } catch (err) {
            throw new Error(err instanceof Error ? err.message : 'Login failed', { cause: err });
        }
    }, [hydratePreferences]);

    const logout = useCallback(async () => {
        setLogoutPendingState(true);
        setExplicitLogoutSuppressed();

        const authConfig = await getAuthConfig().catch(() => null);
        const shouldUseSsoLogout = authConfig?.auth_mode === 'microsoft_sso';

        try {
            await authApi.logout();
        } catch (error) {
            clearExplicitLogoutSuppressed();
            setLogoutErrorState(
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
        markPreferencesReady(true);

        if (shouldUseSsoLogout) {
            try {
                await entraAuth.logoutRedirect();
            } catch (error) {
                console.error(error);
            }
        }
    }, [markPreferencesReady]);

    return { login, logout };
}
