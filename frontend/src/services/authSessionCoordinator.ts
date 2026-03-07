import { authApi } from '@/services/authApi';
import { getAccessToken } from '@/services/accessTokenStore';
import { isAuthUnavailableError } from '@/services/authRequest';
import { silentReauthAndExchange } from '@/services/ssoSession';

type CurrentUser = Awaited<ReturnType<typeof authApi.getCurrentUser>>;

const BOOTSTRAP_CACHE_TTL_MS = 5_000;

let bootstrapPromise: Promise<{ token: string | null; user: CurrentUser | null }> | null = null;
let cachedBootstrap: { token: string; user: CurrentUser; expiresAt: number } | null = null;

function getCachedBootstrap(token: string): { token: string; user: CurrentUser } | null {
    if (!cachedBootstrap) return null;
    if (cachedBootstrap.token !== token) return null;
    if (cachedBootstrap.expiresAt <= Date.now()) {
        cachedBootstrap = null;
        return null;
    }
    return cachedBootstrap;
}

export function cacheBootstrapSession(user: CurrentUser, token: string): void {
    cachedBootstrap = {
        token,
        user,
        expiresAt: Date.now() + BOOTSTRAP_CACHE_TTL_MS,
    };
}

export function clearBootstrapSession(): void {
    cachedBootstrap = null;
}

export async function bootstrapAuthSession(): Promise<{ token: string | null; user: CurrentUser | null }> {
    if (!bootstrapPromise) {
        bootstrapPromise = (async () => {
            let token = getAccessToken();
            let usedRefresh = false;

            if (!token) {
                token = await silentReauthAndExchange();
                usedRefresh = true;
            }

            if (!token) {
                clearBootstrapSession();
                return { token: null, user: null };
            }

            const cached = getCachedBootstrap(token);
            if (cached) {
                return { token: cached.token, user: cached.user };
            }

            try {
                const user = await authApi.getCurrentUser(token);
                cacheBootstrapSession(user, token);
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
            cacheBootstrapSession(user, refreshedToken);
            return { token: refreshedToken, user };
        })().finally(() => {
            bootstrapPromise = null;
        });
    }

    return bootstrapPromise;
}

export function __resetAuthSessionCoordinatorForTests(): void {
    bootstrapPromise = null;
    cachedBootstrap = null;
}
