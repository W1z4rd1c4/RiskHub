import { authApi } from '@/services/authApi';
import { isAuthUnavailableError } from '@/services/authRequest';

import { applyAuthenticatedSession } from './manager';
import { isExplicitLogoutSuppressed } from './logoutSuppression';
import { clearRefreshSessionHint, hasRefreshSessionHint } from './refreshHint';
import { getSessionSnapshot } from './store';

let refreshInFlight: Promise<string | null> | null = null;
let lastRefreshFailureAt = 0;
const REFRESH_FAILURE_COOLDOWN_MS = 1_000;

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

export function __resetSilentSessionRefreshForTests(): void {
    refreshInFlight = null;
    lastRefreshFailureAt = 0;
}
