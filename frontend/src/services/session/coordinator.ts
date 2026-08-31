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
export interface SessionOwnershipSnapshot {
    generation: number;
    principalId: number | null;
}

let sessionGeneration = 0;
let refreshInFlight: {
    owner: SessionOwnershipSnapshot;
    promise: Promise<string | null>;
} | null = null;
let lastRefreshFailureAt = 0;
let lastRefreshFailureGeneration: number | null = null;
const REFRESH_FAILURE_COOLDOWN_MS = 1_000;

type CurrentUser = Awaited<ReturnType<typeof authApi.getCurrentUser>>;
type BootstrapResult = { token: string | null; user: CurrentUser | null };

let bootstrapInFlight: {
    owner: SessionOwnershipSnapshot;
    promise: Promise<BootstrapResult>;
} | null = null;

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

function currentPrincipalId(): number | null {
    return getSessionSnapshot().user?.id ?? null;
}

function advanceSessionGeneration(): void {
    sessionGeneration += 1;
}

export function getSessionOwnershipSnapshot(): SessionOwnershipSnapshot {
    return {
        generation: sessionGeneration,
        principalId: currentPrincipalId(),
    };
}

export function isSessionOwnershipCurrent(owner: SessionOwnershipSnapshot): boolean {
    return owner.generation === sessionGeneration && owner.principalId === currentPrincipalId();
}

function isSameSessionOwner(left: SessionOwnershipSnapshot, right: SessionOwnershipSnapshot): boolean {
    return left.generation === right.generation && left.principalId === right.principalId;
}

function setAuthenticatedSession(user: SessionUser, token: string, forceNewGeneration = false): void {
    const previous = getSessionSnapshot();
    if (forceNewGeneration || previous.user?.id !== user.id || !previous.token) {
        advanceSessionGeneration();
    }
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
        if (getSessionSnapshot().token !== token) {
            advanceSessionGeneration();
        }
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
    const previous = getSessionSnapshot();
    if (previous.user?.id !== session.user.id || previous.token !== session.token) {
        advanceSessionGeneration();
    }
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
    if (getSessionSnapshot().token || getSessionSnapshot().user) {
        advanceSessionGeneration();
    }
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
    if (getSessionSnapshot().token || getSessionSnapshot().user) {
        advanceSessionGeneration();
    }
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

    const current = getSessionSnapshot();
    const nextBootstrapStatus = clearBootstrap || current.token === null ? 'anonymous' : 'loading';
    if (current.token || current.user) {
        advanceSessionGeneration();
    }
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
    setAuthenticatedSession(response.user, response.access_token, true);
    return resolvePostLoginRedirect(response, fallbackReturnTo);
}

export function clearBootstrapSession(): void {
    if (getSessionSnapshot().user) {
        advanceSessionGeneration();
    }
    setSessionSnapshot((previous) => ({
        ...previous,
        user: null,
        bootstrapStatus: previous.token ? 'loading' : 'anonymous',
        bootstrapError: null,
    }));
}

export function setBootstrapSession(session: BootstrapSession): void {
    const previous = getSessionSnapshot();
    if (previous.user?.id !== session.user.id || previous.token !== session.token) {
        advanceSessionGeneration();
    }
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

function clearBootstrapSessionIfOwned(owner: SessionOwnershipSnapshot): void {
    if (isSessionOwnershipCurrent(owner)) {
        clearBootstrapSession();
    }
}

async function runBootstrapAuthSession(initialOwner: SessionOwnershipSnapshot): Promise<BootstrapResult> {
    let owner = initialOwner;
    if (isExplicitLogoutSuppressed()) {
        clearBootstrapSessionIfOwned(owner);
        return { token: null, user: null };
    }

    const snapshot = getSessionSnapshot();
    let token = snapshot.token;
    let usedRefresh = false;

    if (!token) {
        if (!hasRefreshSessionHint()) {
            clearBootstrapSessionIfOwned(owner);
            return { token: null, user: null };
        }
        token = await trySilentSessionRefresh(owner);
        usedRefresh = true;
        if (token) {
            const refreshedSnapshot = getSessionSnapshot();
            if (refreshedSnapshot.token !== token || !refreshedSnapshot.user) {
                return { token: null, user: null };
            }
            owner = getSessionOwnershipSnapshot();
        }
    }

    if (!isSessionOwnershipCurrent(owner)) {
        return { token: null, user: null };
    }
    if (!token) {
        clearBootstrapSessionIfOwned(owner);
        return { token: null, user: null };
    }

    const cachedSnapshot = getSessionSnapshot();
    const cachedUser = cachedSnapshot.token === token ? cachedSnapshot.user : null;
    if (cachedUser) {
        if (isExplicitLogoutSuppressed()) {
            clearBootstrapSessionIfOwned(owner);
            return { token: null, user: null };
        }
        return { token, user: cachedUser };
    }

    try {
        const user = await authApi.getCurrentUser(token);
        if (!isSessionOwnershipCurrent(owner)) {
            return { token: null, user: null };
        }
        if (isExplicitLogoutSuppressed()) {
            clearBootstrapSessionIfOwned(owner);
            return { token: null, user: null };
        }
        return { token, user };
    } catch (error) {
        if (!isSessionOwnershipCurrent(owner)) {
            return { token: null, user: null };
        }
        if (usedRefresh || isAuthUnavailableError(error)) {
            clearBootstrapSessionIfOwned(owner);
            throw error;
        }
    }

    const refreshedToken = await trySilentSessionRefresh(owner);
    if (!isSessionOwnershipCurrent(owner)) {
        return { token: null, user: null };
    }
    if (!refreshedToken) {
        clearBootstrapSessionIfOwned(owner);
        return { token: null, user: null };
    }

    const user = await authApi.getCurrentUser(refreshedToken);
    if (!isSessionOwnershipCurrent(owner)) {
        return { token: null, user: null };
    }
    if (isExplicitLogoutSuppressed()) {
        clearBootstrapSessionIfOwned(owner);
        return { token: null, user: null };
    }
    return { token: refreshedToken, user };
}

export function bootstrapAuthSession(): Promise<BootstrapResult> {
    const owner = getSessionOwnershipSnapshot();
    if (bootstrapInFlight && isSameSessionOwner(bootstrapInFlight.owner, owner)) {
        return bootstrapInFlight.promise;
    }

    const promise = runBootstrapAuthSession(owner).finally(() => {
        if (bootstrapInFlight?.promise === promise) {
            bootstrapInFlight = null;
        }
    });
    bootstrapInFlight = { owner, promise };
    return promise;
}

export async function trySilentSessionRefresh(
    owner: SessionOwnershipSnapshot = getSessionOwnershipSnapshot(),
): Promise<string | null> {
    if (isExplicitLogoutSuppressed()) {
        return null;
    }
    if (!isSessionOwnershipCurrent(owner)) {
        return null;
    }
    if (
        !refreshInFlight
        && lastRefreshFailureGeneration === owner.generation
        && lastRefreshFailureAt > 0
        && Date.now() - lastRefreshFailureAt < REFRESH_FAILURE_COOLDOWN_MS
    ) {
        return null;
    }

    if (refreshInFlight) {
        if (
            refreshInFlight.owner.generation === owner.generation
            && refreshInFlight.owner.principalId === owner.principalId
        ) {
            return refreshInFlight.promise;
        }

        try {
            await refreshInFlight.promise;
        } catch {
            // A different owner's failed refresh cannot determine the current
            // owner's outcome. Recheck ownership, then start the current flight.
        }
        return isSessionOwnershipCurrent(owner) ? trySilentSessionRefresh(owner) : null;
    }

    const promise = runSilentSessionRefreshAttempt(owner).finally(() => {
        if (refreshInFlight?.promise === promise) {
            refreshInFlight = null;
        }
    });
    refreshInFlight = { owner, promise };
    return promise;
}

async function runSilentSessionRefreshAttempt(owner: SessionOwnershipSnapshot): Promise<string | null> {
    if (isExplicitLogoutSuppressed() || !isSessionOwnershipCurrent(owner)) {
        return null;
    }
    const shouldTryRefresh = !!getSessionSnapshot().token || hasRefreshSessionHint();
    let refreshResponse = null;
    if (shouldTryRefresh) {
        try {
            refreshResponse = await authApi.refresh();
        } catch (error) {
            if (!isSessionOwnershipCurrent(owner)) {
                return null;
            }
            if (isAuthUnavailableError(error)) {
                throw error;
            }
            clearRefreshSessionHint();
        }
    }
    if (!isSessionOwnershipCurrent(owner)) {
        return null;
    }
    if (refreshResponse?.access_token) {
        if (isExplicitLogoutSuppressed()) {
            return null;
        }
        lastRefreshFailureAt = 0;
        lastRefreshFailureGeneration = null;
        setAuthenticatedSession(refreshResponse.user, refreshResponse.access_token);
        return refreshResponse.access_token;
    }

    if (!isExplicitLogoutSuppressed()) {
        lastRefreshFailureAt = Date.now();
        lastRefreshFailureGeneration = owner.generation;
    }
    return null;
}

export function __resetAuthSessionCoordinatorForTests(): void {
    bootstrapInFlight = null;
    sessionGeneration = 0;
}

export function __resetBootstrapSessionCacheForTests(): void {
    clearBootstrapSession();
}

export function __resetSilentSessionRefreshForTests(): void {
    refreshInFlight = null;
    lastRefreshFailureAt = 0;
    lastRefreshFailureGeneration = null;
}
