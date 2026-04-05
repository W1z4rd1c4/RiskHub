import { authApi } from '@/services/authApi';
import { getAccessToken } from '@/services/accessTokenStore';
import {
    __resetBootstrapSessionCacheForTests,
    clearBootstrapSession,
    getBootstrapSession,
    type BootstrapSession,
} from '@/services/bootstrapSessionCache';
import { isExplicitLogoutSuppressed } from '@/services/logoutSuppression';
import { isAuthUnavailableError } from '@/services/authRequest';
import { hasRefreshSessionHint } from '@/services/refreshSessionHint';
import { silentReauthAndExchange } from '@/services/ssoSession';

type CurrentUser = Awaited<ReturnType<typeof authApi.getCurrentUser>>;

let bootstrapPromise: Promise<{ token: string | null; user: CurrentUser | null }> | null = null;

export async function bootstrapAuthSession(): Promise<{ token: string | null; user: CurrentUser | null }> {
    if (!bootstrapPromise) {
        bootstrapPromise = (async () => {
            if (isExplicitLogoutSuppressed()) {
                clearBootstrapSession();
                return { token: null, user: null };
            }

            let token = getAccessToken();
            let usedRefresh = false;

            if (!token) {
                if (!hasRefreshSessionHint()) {
                    clearBootstrapSession();
                    return { token: null, user: null };
                }
                token = await silentReauthAndExchange();
                usedRefresh = true;
            }

            if (!token) {
                clearBootstrapSession();
                return { token: null, user: null };
            }

            const cached = getBootstrapSession(token);
            if (cached) {
                if (isExplicitLogoutSuppressed()) {
                    clearBootstrapSession();
                    return { token: null, user: null };
                }
                return { token: cached.token, user: cached.user };
            }

            try {
                const user = await authApi.getCurrentUser(token);
                if (isExplicitLogoutSuppressed()) {
                    clearBootstrapSession();
                    return { token: null, user: null };
                }
                return { token, user };
            } catch (error) {
                if (usedRefresh || isAuthUnavailableError(error)) {
                    clearBootstrapSession();
                    throw error;
                }
            }

            const refreshedToken = await silentReauthAndExchange();
            if (!refreshedToken) {
                clearBootstrapSession();
                return { token: null, user: null };
            }

            const user = await authApi.getCurrentUser(refreshedToken);
            if (isExplicitLogoutSuppressed()) {
                clearBootstrapSession();
                return { token: null, user: null };
            }
            return { token: refreshedToken, user };
        })().finally(() => {
            bootstrapPromise = null;
        });
    }

    return bootstrapPromise;
}

export function __resetAuthSessionCoordinatorForTests(): void {
    bootstrapPromise = null;
    __resetBootstrapSessionCacheForTests();
}

export { clearBootstrapSession };
export type { BootstrapSession };
