import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authApi, type TokenResponse } from '@/services/authApi';
import { AuthRequestError } from '@/services/authRequest';
import {
    __resetAuthSessionCoordinatorForTests,
    __resetSessionStoreForTests,
    __resetSilentSessionRefreshForTests,
    __setRefreshSessionHintForTests,
    applyAuthenticatedSession,
    bootstrapAuthSession,
    clearExplicitLogoutSuppressed,
    getSessionSnapshot,
    trySilentSessionRefresh,
} from '@/services/session';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((settle, fail) => {
        resolve = settle;
        reject = fail;
    });
    return { promise, resolve, reject };
}

function session(userId: number, token: string): TokenResponse {
    return {
        access_token: token,
        token_type: 'bearer',
        user: {
            id: userId,
            email: `user-${userId}@example.test`,
            name: `User ${userId}`,
            role: 'employee',
            role_display_name: 'Employee',
            permissions: [],
            effective_permissions: [],
            access_scope: 'department',
            scope_label: 'Department',
        },
    };
}

beforeEach(() => {
    vi.restoreAllMocks();
    __resetSessionStoreForTests();
    __resetAuthSessionCoordinatorForTests();
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

    it('contains a stale owner failure before the current owner starts its own refresh', async () => {
        const staleFailure = new AuthRequestError({
            code: 'AUTH_REQUEST_TIMEOUT',
            message: 'stale refresh timed out',
        });
        let currentRefresh: Promise<string | null> | undefined;
        let ownerChanged = false;
        Object.defineProperty(staleFailure, 'code', {
            configurable: true,
            get: () => {
                if (!ownerChanged) {
                    ownerChanged = true;
                    applyAuthenticatedSession(session(2, 'token-b'));
                    currentRefresh = trySilentSessionRefresh();
                }
                return 'AUTH_REQUEST_TIMEOUT';
            },
        });
        const refreshSpy = vi.spyOn(authApi, 'refresh')
            .mockRejectedValueOnce(staleFailure)
            .mockResolvedValueOnce(session(2, 'token-b-refreshed'));

        applyAuthenticatedSession(session(1, 'token-a'));
        const staleRefresh = trySilentSessionRefresh();

        await expect(staleRefresh).rejects.toBe(staleFailure);
        expect(currentRefresh).toBeDefined();
        await expect(currentRefresh).resolves.toBe('token-b-refreshed');
        expect(refreshSpy).toHaveBeenCalledTimes(2);
        expect(getSessionSnapshot()).toMatchObject({
            token: 'token-b-refreshed',
            user: { id: 2 },
        });
    });

    it('still propagates an unavailable refresh failure to the same owner', async () => {
        const failure = new AuthRequestError({
            code: 'AUTH_REQUEST_TIMEOUT',
            message: 'refresh timed out',
        });
        vi.spyOn(authApi, 'refresh').mockRejectedValue(failure);

        await expect(trySilentSessionRefresh()).rejects.toBe(failure);
    });

    it.each(['success', 'failure'] as const)(
        'does not reuse an anonymous bootstrap flight after User B signs in and the old refresh ends in %s',
        async (outcome) => {
            const staleRefresh = deferred<TokenResponse>();
            vi.spyOn(authApi, 'refresh').mockReturnValue(staleRefresh.promise);

            const staleBootstrap = bootstrapAuthSession();
            await vi.waitFor(() => expect(authApi.refresh).toHaveBeenCalledOnce());

            applyAuthenticatedSession(session(2, 'token-b'));
            const currentBootstrap = bootstrapAuthSession();

            if (outcome === 'success') {
                staleRefresh.resolve(session(1, 'token-a-refreshed'));
            } else {
                staleRefresh.reject(new Error('stale refresh failed'));
            }

            await expect(staleBootstrap).resolves.toEqual({ token: null, user: null });
            await expect(currentBootstrap).resolves.toMatchObject({
                token: 'token-b',
                user: { id: 2 },
            });
            expect(getSessionSnapshot()).toMatchObject({
                token: 'token-b',
                user: { id: 2 },
                bootstrapStatus: 'authenticated',
            });
        },
    );
});
