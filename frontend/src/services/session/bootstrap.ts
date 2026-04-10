import { authApi } from '@/services/authApi';
import { isAuthUnavailableError } from '@/services/authRequest';

import { isExplicitLogoutSuppressed } from './logoutSuppression';
import { hasRefreshSessionHint } from './refreshHint';
import { getSessionSnapshot, setSessionSnapshot } from './store';
import { trySilentSessionRefresh } from './sso';

type CurrentUser = Awaited<ReturnType<typeof authApi.getCurrentUser>>;

export interface BootstrapSession {
    token: string;
    user: CurrentUser;
}

let bootstrapPromise: Promise<{ token: string | null; user: CurrentUser | null }> | null = null;

export function clearBootstrapSession(): void {
    setSessionSnapshot((previous) => ({
        ...previous,
        user: null,
        bootstrapStatus: previous.token ? 'loading' : 'anonymous',
        bootstrapError: null,
    }));
}

export function setBootstrapSession(session: BootstrapSession): void {
    setSessionSnapshot((previous) => ({
        ...previous,
        token: session.token,
        user: session.user,
        bootstrapStatus: 'authenticated',
        bootstrapError: null,
        logoutPending: false,
        logoutErrorKey: null,
    }));
}

export async function bootstrapAuthSession(): Promise<{ token: string | null; user: CurrentUser | null }> {
    if (!bootstrapPromise) {
        bootstrapPromise = (async () => {
            if (isExplicitLogoutSuppressed()) {
                clearBootstrapSession();
                return { token: null, user: null };
            }

            const snapshot = getSessionSnapshot();
            let token = snapshot.token;
            let usedRefresh = false;

            if (!token) {
                if (!hasRefreshSessionHint()) {
                    clearBootstrapSession();
                    return { token: null, user: null };
                }
                token = await trySilentSessionRefresh();
                usedRefresh = true;
            }

            if (!token) {
                clearBootstrapSession();
                return { token: null, user: null };
            }

            const cachedUser = getSessionSnapshot().token === token ? getSessionSnapshot().user : null;
            if (cachedUser) {
                if (isExplicitLogoutSuppressed()) {
                    clearBootstrapSession();
                    return { token: null, user: null };
                }
                return { token, user: cachedUser };
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

            const refreshedToken = await trySilentSessionRefresh();
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
}

export function __resetBootstrapSessionCacheForTests(): void {
    clearBootstrapSession();
}
