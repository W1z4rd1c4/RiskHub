import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authApi } from '@/services/authApi';
import {
    __resetSessionStoreForTests,
    __resetSilentSessionRefreshForTests,
    __setRefreshSessionHintForTests,
    clearExplicitLogoutSuppressed,
    trySilentSessionRefresh,
} from '@/services/session';

beforeEach(() => {
    vi.restoreAllMocks();
    __resetSessionStoreForTests();
    __resetSilentSessionRefreshForTests();
    clearExplicitLogoutSuppressed();
    __setRefreshSessionHintForTests();
});

describe('session coordinator single-flight', () => {
    it('two concurrent calls share one in-flight refresh', async () => {
        const refreshSpy = vi.spyOn(authApi, 'refresh').mockResolvedValue({
            access_token: 'tok',
            token_type: 'bearer',
            user: { id: 1 } as any,
        } as any);

        const [a, b] = await Promise.all([
            trySilentSessionRefresh(),
            trySilentSessionRefresh(),
        ]);

        expect(refreshSpy).toHaveBeenCalledTimes(1);
        expect(a).toBe('tok');
        expect(b).toBe('tok');
    });

    it('REFRESH_FAILURE_COOLDOWN_MS gates retries after failure', async () => {
        const refreshSpy = vi.spyOn(authApi, 'refresh').mockRejectedValueOnce(new Error('boom'));

        await trySilentSessionRefresh();
        const second = await trySilentSessionRefresh();

        expect(refreshSpy).toHaveBeenCalledTimes(1);
        expect(second).toBeNull();
    });
});
