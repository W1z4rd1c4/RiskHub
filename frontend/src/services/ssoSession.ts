import { authApi } from '@/services/authApi';
import { getAccessToken, setAccessToken } from '@/services/accessTokenStore';
import { getAuthConfig } from '@/services/authConfig';
import { entraAuth } from '@/services/entraAuth';
import { isExplicitLogoutSuppressed } from '@/services/logoutSuppression';
import { isAuthUnavailableError, raceAuthTimeout } from '@/services/authRequest';
import { clearRefreshSessionHint, hasRefreshSessionHint } from '@/services/refreshSessionHint';

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
                setAccessToken(refreshResponse.access_token);
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

            const idToken = await raceAuthTimeout(
                entraAuth.acquireIdTokenSilent(),
                'Silent sign-in timed out',
            ).catch((error) => {
                if (isAuthUnavailableError(error)) {
                    throw error;
                }
                return null;
            });
            if (!idToken) {
                return null;
            }

            const tokenResponse = await authApi.ssoExchange(idToken).catch((error) => {
                if (isAuthUnavailableError(error)) {
                    throw error;
                }
                return null;
            });
            if (!tokenResponse?.access_token) {
                return null;
            }
            if (isExplicitLogoutSuppressed()) {
                return null;
            }
            lastRefreshFailureAt = 0;
            setAccessToken(tokenResponse.access_token);
            return tokenResponse.access_token;
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
