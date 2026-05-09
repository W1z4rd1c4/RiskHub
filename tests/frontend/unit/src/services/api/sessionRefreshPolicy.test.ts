import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@/services/api/apiErrors';
import {
    applySessionRefreshPolicy,
    shouldAttemptSilentSessionRefresh,
} from '@/services/api/sessionRefreshPolicy';

vi.mock('@/services/session/sessionStorage', () => ({
    isExplicitLogoutSuppressed: vi.fn(() => false),
}));

describe('shouldAttemptSilentSessionRefresh', () => {
    it('returns false when attempt > 0', () => {
        expect(shouldAttemptSilentSessionRefresh({ pathname: '/api/v1/risks', attempt: 1 })).toBe(false);
    });

    it('returns false for /api/v1/auth/* paths', () => {
        expect(shouldAttemptSilentSessionRefresh({ pathname: '/api/v1/auth/login', attempt: 0 })).toBe(false);
    });

    it('returns true on first attempt for non-auth paths', () => {
        expect(shouldAttemptSilentSessionRefresh({ pathname: '/api/v1/risks', attempt: 0 })).toBe(true);
    });
});

describe('applySessionRefreshPolicy', () => {
    it('returns retry when refresh succeeds', async () => {
        const out = await applySessionRefreshPolicy(
            { pathname: '/api/v1/risks', attempt: 0 },
            { tryRefresh: async () => 'new-token', clearSession: () => {} },
        );

        expect(out).toEqual({ kind: 'retry' });
    });

    it('clears session and throws 401 when refresh fails', async () => {
        const clear = vi.fn();

        await expect(
            applySessionRefreshPolicy(
                { pathname: '/api/v1/risks', attempt: 0 },
                { tryRefresh: async () => null, clearSession: clear },
            ),
        ).rejects.toBeInstanceOf(ApiClientError);
        expect(clear).toHaveBeenCalledOnce();
    });

    it('skips refresh and clears immediately when policy says no', async () => {
        const tryRefresh = vi.fn();
        const clear = vi.fn();

        await expect(
            applySessionRefreshPolicy(
                { pathname: '/api/v1/auth/login', attempt: 0 },
                { tryRefresh, clearSession: clear },
            ),
        ).rejects.toBeInstanceOf(ApiClientError);
        expect(tryRefresh).not.toHaveBeenCalled();
        expect(clear).toHaveBeenCalledOnce();
    });
});
