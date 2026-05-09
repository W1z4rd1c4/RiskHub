import { getErrorMessageKey } from '@/i18n/errorMessageKey';
import { clearAuthenticatedSession } from '@/services/session/coordinator';
import { isExplicitLogoutSuppressed } from '@/services/session/sessionStorage';
import { trySilentSessionRefresh } from '@/services/session/coordinator';

import { ApiClientError } from './apiErrors';

export interface SessionRefreshContext {
    pathname: string;
    attempt: number;
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

export async function applySessionRefreshPolicy(
    ctx: SessionRefreshContext,
    deps: {
        tryRefresh?: () => Promise<string | null | undefined>;
        clearSession?: () => void;
    } = {},
): Promise<RefreshOutcome> {
    const tryRefresh = deps.tryRefresh ?? trySilentSessionRefresh;
    const clearSession = deps.clearSession ?? (() => clearAuthenticatedSession({ clearBootstrap: true }));

    if (shouldAttemptSilentSessionRefresh(ctx)) {
        const refreshed = await tryRefresh();
        if (refreshed) {
            return { kind: 'retry' };
        }
    }

    clearSession();
    throw new ApiClientError({
        status: 401,
        code: 'UNAUTHORIZED',
        messageKey: getErrorMessageKey('UNAUTHORIZED', 401),
        rawMessage: 'Unauthorized',
    });
}
