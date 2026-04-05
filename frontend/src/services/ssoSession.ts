import { authApi } from '@/services/authApi';
import { getAccessToken } from '@/services/accessTokenStore';
import { getAuthConfig } from '@/services/authConfig';
import { isExplicitLogoutSuppressed } from '@/services/logoutSuppression';
import { isAuthUnavailableError } from '@/services/authRequest';
import { clearRefreshSessionHint, hasRefreshSessionHint } from '@/services/refreshSessionHint';
import { applyAuthenticatedSession } from '@/services/sessionManager';

let refreshInFlight: Promise<string | null> | null = null;
let lastRefreshFailureAt = 0;
const REFRESH_FAILURE_COOLDOWN_MS = 1_000;

export async function silentReauthAndExchange(): Promise<string | null> {
    if (isExplicitLogoutSuppressed()) {
        return null;
    }
    if (!refreshInFlight && lastRefreshFailureAt > 0 && Date.now() - lastRefreshFailureAt < REFRESH_FAILURE_COOLDOWN_MS) {
        return null;
    }

    if (!refreshInFlight) {
        refreshInFlight = (async () => {
            if (isExplicitLogoutSuppressed()) {
                return null;
            }
            const shouldTryRefresh = !!getAccessToken() || hasRefreshSessionHint();
            const refreshResponse = shouldTryRefresh
                ? await authApi.refresh().catch((error) => {
                    if (isAuthUnavailableError(error)) {
                        throw error;
                    }
                    clearRefreshSessionHint();
                    return null;
                })
                : null;
            if (refreshResponse?.access_token) {
                if (isExplicitLogoutSuppressed()) {
                    return null;
                }
                lastRefreshFailureAt = 0;
                applyAuthenticatedSession(refreshResponse);
                return refreshResponse.access_token;
            }

            const config = await getAuthConfig().catch((error) => {
                if (isAuthUnavailableError(error)) {
                    throw error;
                }
                return null;
            });
            if (!config?.sso.enabled) {
                return null;
            }
            return null;
        })().then((token) => {
            if (!token && !isExplicitLogoutSuppressed()) {
                lastRefreshFailureAt = Date.now();
            }
            return token;
        }).finally(() => {
            refreshInFlight = null;
        });
    }

    return refreshInFlight;
}

export function __resetSsoSessionForTests(): void {
    refreshInFlight = null;
    lastRefreshFailureAt = 0;
}
