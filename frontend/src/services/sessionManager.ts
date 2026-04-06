import type { TokenResponse } from '@/services/authApi';
import { sanitizeReturnTo } from '@/services/authRedirect';
import {
    type BootstrapSession,
} from '@/services/bootstrapSessionCache';
import { clearCsrfToken } from '@/services/csrfToken';
import { clearRefreshSessionHint } from '@/services/refreshSessionHint';
import { getSessionSnapshot, setSessionSnapshot } from '@/services/sessionStore';
import type { SessionBootstrapError } from '@/services/sessionTypes';

interface ClearAuthenticatedSessionOptions {
    clearBootstrap?: boolean;
    clearCsrf?: boolean;
    clearRefreshHint?: boolean;
}

export type SessionUser = TokenResponse['user'];

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
    return response.post_login_redirect_to || sanitizeReturnTo(fallbackReturnTo);
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

export function applyBootstrappedSession(session: BootstrapSession): void {
    setAuthenticatedSession(session.user, session.token);
}

export function applyBootstrappingSession(session: BootstrapSession): void {
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

export function applyAnonymousSession(): void {
    setSessionSnapshot((previous) => ({
        ...previous,
        token: null,
        user: null,
        bootstrapStatus: 'anonymous',
        bootstrapError: null,
        logoutPending: false,
        logoutErrorKey: null,
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
