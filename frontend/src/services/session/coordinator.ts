import type { TokenResponse } from '@/services/authApi';
import { authApi } from '@/services/authApi';
import { sanitizeReturnTo } from '@/services/authRedirect';
import { isAuthUnavailableError } from '@/services/authRequest';
import { clearCsrfToken } from '@/services/csrfToken';

import {
    clearRefreshSessionHint,
    hasRefreshSessionHint,
    isExplicitLogoutSuppressed,
} from './sessionStorage';
import { getSessionSnapshot, setSessionSnapshot } from './store';
import type { SessionBootstrapError } from './types';

// Module-scope state -- preserved from sso.ts and bootstrap.ts.
// Single-flight refresh and bootstrap cache semantics depend on these references.
let refreshInFlight: Promise<string | null> | null = null;
let lastRefreshFailureAt = 0;
const REFRESH_FAILURE_COOLDOWN_MS = 1_000;
let bootstrapPromise: Promise<{ token: string | null; user: CurrentUser | null }> | null = null;

type CurrentUser = Awaited<ReturnType<typeof authApi.getCurrentUser>>;

interface ClearAuthenticatedSessionOptions {
    clearBootstrap?: boolean;
    clearCsrf?: boolean;
    clearRefreshHint?: boolean;
}

interface ApplyAnonymousSessionOptions {
    preserveLogoutError?: boolean;
}

export type SessionUser = TokenResponse['user'];

export interface BootstrappedSession {
    token: string;
    user: SessionUser;
}

export interface BootstrapSession {
    token: string;
    user: CurrentUser;
}

function setAuthenticatedSession(user: SessionUser, token: string): void {
    setSessionSnapshot((previous) => ({
        ...previous,
        token,
        user,
        bootstrapStatus: 'authenticated',
        bootstrapError: null,
        logoutPending: false,
        logoutErrorKey: null,
    }));
}

export function resolvePostLoginRedirect(response: TokenResponse, fallbackReturnTo: string = '/'): string {
    return sanitizeReturnTo(response.post_login_redirect_to ?? fallbackReturnTo);
}

export function syncAuthenticatedToken(token: string | null): void {
    if (token) {
        setSessionSnapshot((previous) => ({
            ...previous,
            token,
            user: previous.token === token ? previous.user : null,
            bootstrapStatus: previous.token === token && previous.user ? 'authenticated' : 'loading',
            bootstrapError: null,
        }));
        return;
    }
    applyAnonymousSession();
}

export function applyBootstrappedSession(session: BootstrappedSession): void {
    setAuthenticatedSession(session.user, session.token);
}

export function applyBootstrappingSession(session: BootstrappedSession): void {
    setSessionSnapshot((previous) => ({
        ...previous,
        token: session.token,
        user: session.user,
        bootstrapStatus: 'loading',
        bootstrapError: null,
        logoutPending: false,
        logoutErrorKey: null,
    }));
}

export function applyAnonymousSession(options: ApplyAnonymousSessionOptions = {}): void {
    const { preserveLogoutError = false } = options;
    setSessionSnapshot((previous) => ({
        ...previous,
        token: null,
        user: null,
        bootstrapStatus: 'anonymous',
        bootstrapError: null,
        logoutPending: false,
        logoutErrorKey: preserveLogoutError ? previous.logoutErrorKey : null,
    }));
}

export function applyBootstrapError(error: SessionBootstrapError): void {
    setSessionSnapshot((previous) => ({
        ...previous,
        token: null,
        user: null,
        bootstrapStatus: error ? 'error' : 'anonymous',
        bootstrapError: error,
        logoutPending: false,
        logoutErrorKey: null,
    }));
}

export function setLogoutPendingState(pending: boolean): void {
    setSessionSnapshot((previous) => ({
        ...previous,
        logoutPending: pending,
        logoutErrorKey: pending ? null : previous.logoutErrorKey,
    }));
}

export function setLogoutErrorState(errorKey: string | null): void {
    setSessionSnapshot((previous) => ({
        ...previous,
        logoutPending: false,
        logoutErrorKey: errorKey,
    }));
}

export function clearAuthenticatedSession(options: ClearAuthenticatedSessionOptions = {}): void {
    const {
        clearBootstrap = true,
        clearCsrf = false,
        clearRefreshHint = false,
    } = options;

    const nextBootstrapStatus = clearBootstrap || getSessionSnapshot().token === null ? 'anonymous' : 'loading';
    setSessionSnapshot((previous) => ({
        ...previous,
        token: null,
        user: null,
        bootstrapStatus: nextBootstrapStatus,
        bootstrapError: null,
        logoutPending: false,
        logoutErrorKey: null,
    }));
    if (clearCsrf) {
        clearCsrfToken();
    }
    if (clearRefreshHint) {
        clearRefreshSessionHint();
    }
}

export function applyAuthenticatedSession(response: TokenResponse, fallbackReturnTo: string = '/'): string {
    setAuthenticatedSession(response.user, response.access_token);
    return resolvePostLoginRedirect(response, fallbackReturnTo);
}

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

            const cachedSnapshot = getSessionSnapshot();
            const cachedUser = cachedSnapshot.token === token ? cachedSnapshot.user : null;
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

export async function trySilentSessionRefresh(): Promise<string | null> {
    if (isExplicitLogoutSuppressed()) {
        return null;
    }
    if (!refreshInFlight && lastRefreshFailureAt > 0 && Date.now() - lastRefreshFailureAt < REFRESH_FAILURE_COOLDOWN_MS) {
        return null;
    }

    if (!refreshInFlight) {
        refreshInFlight = runSilentSessionRefreshAttempt();
    }

    return refreshInFlight;
}

async function runSilentSessionRefreshAttempt(): Promise<string | null> {
    try {
        if (isExplicitLogoutSuppressed()) {
            return null;
        }
        const shouldTryRefresh = !!getSessionSnapshot().token || hasRefreshSessionHint();
        let refreshResponse = null;
        if (shouldTryRefresh) {
            try {
                refreshResponse = await authApi.refresh();
            } catch (error) {
                if (isAuthUnavailableError(error)) {
                    throw error;
                }
                clearRefreshSessionHint();
            }
        }
        if (refreshResponse?.access_token) {
            if (isExplicitLogoutSuppressed()) {
                return null;
            }
            lastRefreshFailureAt = 0;
            applyAuthenticatedSession(refreshResponse);
            return refreshResponse.access_token;
        }

        if (!isExplicitLogoutSuppressed()) {
            lastRefreshFailureAt = Date.now();
        }
        return null;
    } finally {
        refreshInFlight = null;
    }
}

export function __resetAuthSessionCoordinatorForTests(): void {
    bootstrapPromise = null;
}

export function __resetBootstrapSessionCacheForTests(): void {
    clearBootstrapSession();
}

export function __resetSilentSessionRefreshForTests(): void {
    refreshInFlight = null;
    lastRefreshFailureAt = 0;
}
