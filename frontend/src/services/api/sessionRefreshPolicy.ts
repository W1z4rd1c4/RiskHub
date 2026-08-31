import { getErrorMessageKey } from '@/i18n/errorMessageKey';
import {
    clearAuthenticatedSession,
    getSessionOwnershipSnapshot,
    isSessionOwnershipCurrent,
    type SessionOwnershipSnapshot,
} from '@/services/session/coordinator';
import { isExplicitLogoutSuppressed } from '@/services/session/sessionStorage';
import { trySilentSessionRefresh } from '@/services/session/coordinator';

import { ApiClientError } from './apiErrors';

export interface SessionRefreshContext {
    pathname: string;
    attempt: number;
    signal?: AbortSignal;
    owner?: SessionOwnershipSnapshot;
}

export type RefreshOutcome =
    | { kind: 'retry' }
    | { kind: 'unauthorized' };

export function shouldAttemptSilentSessionRefresh({ pathname, attempt }: SessionRefreshContext): boolean {
    if (isExplicitLogoutSuppressed()) return false;
    if (attempt > 0) return false;
    if (pathname.startsWith('/api/v1/auth/')) return false;
    return true;
}

function unauthorizedError(): ApiClientError {
    return new ApiClientError({
        status: 401,
        code: 'UNAUTHORIZED',
        messageKey: getErrorMessageKey('UNAUTHORIZED', 401),
        rawMessage: 'Unauthorized',
    });
}

export function assertRequestSessionOwnershipCurrent(owner: SessionOwnershipSnapshot): void {
    if (!isSessionOwnershipCurrent(owner)) {
        throw unauthorizedError();
    }
}

export async function applySessionRefreshPolicy(
    ctx: SessionRefreshContext,
    deps: {
        tryRefresh?: () => Promise<string | null | undefined>;
        clearSession?: () => void;
    } = {},
): Promise<RefreshOutcome> {
    const owner = ctx.owner ?? getSessionOwnershipSnapshot();
    const tryRefresh = deps.tryRefresh ?? (() => trySilentSessionRefresh(owner));
    const clearSession = deps.clearSession ?? (() => clearAuthenticatedSession({ clearBootstrap: true }));
    const throwIfAborted = () => {
        if (ctx.signal?.aborted) {
            throw new DOMException('The operation was aborted.', 'AbortError');
        }
    };

    throwIfAborted();
    assertRequestSessionOwnershipCurrent(owner);
    if (shouldAttemptSilentSessionRefresh(ctx)) {
        const refreshed = await tryRefresh();
        throwIfAborted();
        assertRequestSessionOwnershipCurrent(owner);
        if (refreshed) {
            return { kind: 'retry' };
        }
    }

    throwIfAborted();
    if (isSessionOwnershipCurrent(owner)) {
        clearSession();
    }
    throw unauthorizedError();
}
