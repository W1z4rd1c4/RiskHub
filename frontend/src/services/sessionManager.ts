import type { TokenResponse } from '@/services/authApi';
import { sanitizeReturnTo } from '@/services/authRedirect';
import {
    clearBootstrapSession,
    type BootstrapSession,
    setBootstrapSession,
} from '@/services/bootstrapSessionCache';
import { clearAccessToken, setAccessToken } from '@/services/accessTokenStore';
import { clearCsrfToken } from '@/services/csrfToken';
import { clearRefreshSessionHint } from '@/services/refreshSessionHint';

interface ClearAuthenticatedSessionOptions {
    clearBootstrap?: boolean;
    clearCsrf?: boolean;
    clearRefreshHint?: boolean;
}

export type SessionUser = TokenResponse['user'];

function cacheSession(user: SessionUser, token: string): void {
    setAccessToken(token);
    setBootstrapSession({ user, token });
}

export function resolvePostLoginRedirect(response: TokenResponse, fallbackReturnTo: string = '/'): string {
    return response.post_login_redirect_to || sanitizeReturnTo(fallbackReturnTo);
}

export function syncAuthenticatedToken(token: string | null): void {
    if (token) {
        setAccessToken(token);
        return;
    }
    clearAccessToken();
}

export function applyBootstrappedSession(session: BootstrapSession): void {
    cacheSession(session.user, session.token);
}

export function clearAuthenticatedSession(options: ClearAuthenticatedSessionOptions = {}): void {
    const {
        clearBootstrap = true,
        clearCsrf = false,
        clearRefreshHint = false,
    } = options;

    clearAccessToken();
    if (clearBootstrap) {
        clearBootstrapSession();
    }
    if (clearCsrf) {
        clearCsrfToken();
    }
    if (clearRefreshHint) {
        clearRefreshSessionHint();
    }
}

export function applyAuthenticatedSession(response: TokenResponse, fallbackReturnTo: string = '/'): string {
    cacheSession(response.user, response.access_token);
    return resolvePostLoginRedirect(response, fallbackReturnTo);
}
