import { authApi } from '@/services/authApi';
import { setAccessToken } from '@/services/accessTokenStore';
import { getAuthConfig } from '@/services/authConfig';
import { entraAuth } from '@/services/entraAuth';

let refreshInFlight: Promise<string | null> | null = null;

export async function silentReauthAndExchange(): Promise<string | null> {
    if (!refreshInFlight) {
        refreshInFlight = (async () => {
            const refreshResponse = await authApi.refresh().catch(() => null);
            if (refreshResponse?.access_token) {
                setAccessToken(refreshResponse.access_token);
                return refreshResponse.access_token;
            }

            const config = await getAuthConfig().catch(() => null);
            if (!config?.sso.enabled) {
                return null;
            }

            const idToken = await entraAuth.acquireIdTokenSilent().catch(() => null);
            if (!idToken) {
                return null;
            }

            const tokenResponse = await authApi.ssoExchange(idToken);
            setAccessToken(tokenResponse.access_token);
            return tokenResponse.access_token;
        })().finally(() => {
            refreshInFlight = null;
        });
    }

    return refreshInFlight;
}

export function __resetSsoSessionForTests(): void {
    refreshInFlight = null;
}
