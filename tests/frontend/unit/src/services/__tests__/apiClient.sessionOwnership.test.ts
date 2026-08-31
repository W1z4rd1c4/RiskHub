import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@test/mocks/server';
import { apiClient } from '@/services/apiClient';
import { userPreferencesSchema, z } from '@/services/api/schemas';
import { authApi, type TokenResponse } from '@/services/authApi';
import {
    __resetSessionStoreForTests,
    __resetSilentSessionRefreshForTests,
    applyAuthenticatedSession,
    clearExplicitLogoutSuppressed,
    getSessionSnapshot,
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

describe('ApiClient 401 recovery ownership', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        __resetSessionStoreForTests();
        __resetSilentSessionRefreshForTests();
        clearExplicitLogoutSuppressed();
    });

    it.each(['success', 'failure'] as const)(
        'discards a late User A refresh %s after User B signs in',
        async (outcome) => {
            const refresh = deferred<TokenResponse>();
            vi.spyOn(authApi, 'refresh').mockReturnValue(refresh.promise);
            applyAuthenticatedSession(session(1, 'token-a'));

            const authorizationHeaders: Array<string | null> = [];
            server.use(
                http.get('*/api/v1/preferences', ({ request }) => {
                    authorizationHeaders.push(request.headers.get('authorization'));
                    return new HttpResponse(null, { status: 401 });
                }),
            );

            const controller = new AbortController();
            const request = apiClient.get('/preferences', {
                schema: userPreferencesSchema,
                signal: controller.signal,
            });
            await vi.waitFor(() => expect(authApi.refresh).toHaveBeenCalledOnce());

            applyAuthenticatedSession(session(2, 'token-b'));
            controller.abort();
            if (outcome === 'success') {
                refresh.resolve(session(1, 'token-a-refreshed'));
            } else {
                refresh.reject(new Error('User A refresh failed'));
            }

            await expect(request).rejects.toMatchObject({ name: 'AbortError' });
            expect(getSessionSnapshot()).toMatchObject({
                token: 'token-b',
                user: { id: 2 },
                bootstrapStatus: 'authenticated',
            });
            expect(authorizationHeaders).toEqual(['Bearer token-a']);
        },
    );

    it.each(['POST', 'PUT'] as const)(
        'does not recover or replay a signal-less stale %s request as the next principal',
        async (method) => {
            const firstResponse = deferred<void>();
            const firstRequestStarted = deferred<void>();
            const authorizationHeaders: Array<string | null> = [];
            const handler = async ({ request }: { request: Request }) => {
                authorizationHeaders.push(request.headers.get('authorization'));
                if (authorizationHeaders.length === 1) {
                    firstRequestStarted.resolve();
                    await firstResponse.promise;
                    return new HttpResponse(null, { status: 401 });
                }
                return HttpResponse.json({ ok: true });
            };
            server.use(method === 'POST'
                ? http.post('*/api/v1/ownership-mutation', handler)
                : http.put('*/api/v1/ownership-mutation', handler));

            const refreshSpy = vi.spyOn(authApi, 'refresh').mockResolvedValue(session(2, 'token-b-refreshed'));
            applyAuthenticatedSession(session(1, 'token-a'));
            const responseSchema = z.object({ ok: z.literal(true) });
            const request = method === 'POST'
                ? apiClient.post('/ownership-mutation', { value: 'from-a' }, { schema: responseSchema })
                : apiClient.put('/ownership-mutation', { value: 'from-a' }, { schema: responseSchema });

            await firstRequestStarted.promise;
            applyAuthenticatedSession(session(2, 'token-b'));
            firstResponse.resolve();

            await expect(request).rejects.toMatchObject({ status: 401 });
            expect(refreshSpy).not.toHaveBeenCalled();
            expect(authorizationHeaders).toEqual(['Bearer token-a']);
            expect(getSessionSnapshot()).toMatchObject({
                token: 'token-b',
                user: { id: 2 },
                bootstrapStatus: 'authenticated',
            });
        },
    );

    it('rejects a late authenticated JSON response after another principal signs in', async () => {
        const response = deferred<void>();
        const requestStarted = deferred<void>();
        server.use(
            http.post('*/api/v1/ownership-mutation', async () => {
                requestStarted.resolve();
                await response.promise;
                return HttpResponse.json({ ok: true });
            }),
        );

        applyAuthenticatedSession(session(1, 'token-a'));
        const request = apiClient.post(
            '/ownership-mutation',
            { value: 'from-a' },
            { schema: z.object({ ok: z.literal(true) }) },
        );

        await requestStarted.promise;
        applyAuthenticatedSession(session(2, 'token-b'));
        response.resolve();

        await expect(request).rejects.toMatchObject({ status: 401 });
        expect(getSessionSnapshot()).toMatchObject({
            token: 'token-b',
            user: { id: 2 },
            bootstrapStatus: 'authenticated',
        });
    });

    it('rejects a late authenticated blob before a download consumer can act', async () => {
        const response = deferred<void>();
        const requestStarted = deferred<void>();
        const consumeDownload = vi.fn();
        server.use(
            http.get('*/api/v1/reports/risk-export', async () => {
                requestStarted.resolve();
                await response.promise;
                return new HttpResponse('risk,data', {
                    status: 200,
                    headers: { 'Content-Type': 'text/csv' },
                });
            }),
        );

        applyAuthenticatedSession(session(1, 'token-a'));
        const request = apiClient.getBlob('/reports/risk-export').then((result) => {
            consumeDownload(result.blob);
            return result;
        });

        await requestStarted.promise;
        applyAuthenticatedSession(session(2, 'token-b'));
        response.resolve();

        await expect(request).rejects.toMatchObject({ status: 401 });
        expect(consumeDownload).not.toHaveBeenCalled();
        expect(getSessionSnapshot()).toMatchObject({
            token: 'token-b',
            user: { id: 2 },
            bootstrapStatus: 'authenticated',
        });
    });

    it('allows an anonymous-start request to complete after it establishes a session', async () => {
        const response = deferred<void>();
        const requestStarted = deferred<void>();
        server.use(
            http.get('*/api/v1/auth/me', async () => {
                requestStarted.resolve();
                await response.promise;
                return HttpResponse.json({ ok: true });
            }),
        );

        const request = apiClient.get('/auth/me', {
            schema: z.object({ ok: z.literal(true) }),
        });
        await requestStarted.promise;
        applyAuthenticatedSession(session(1, 'token-a'));
        response.resolve();

        await expect(request).resolves.toEqual({ ok: true });
        expect(getSessionSnapshot()).toMatchObject({
            token: 'token-a',
            user: { id: 1 },
            bootstrapStatus: 'authenticated',
        });
    });

    it('allows a request to retry after a silent refresh for the same principal', async () => {
        const authorizationHeaders: Array<string | null> = [];
        server.use(
            http.get('*/api/v1/preferences', ({ request }) => {
                authorizationHeaders.push(request.headers.get('authorization'));
                return authorizationHeaders.length === 1
                    ? new HttpResponse(null, { status: 401 })
                    : HttpResponse.json({
                        user_id: 1,
                        theme: 'dark',
                        language: 'en',
                    });
            }),
        );
        vi.spyOn(authApi, 'refresh').mockResolvedValue(session(1, 'token-a-refreshed'));
        applyAuthenticatedSession(session(1, 'token-a'));

        await expect(apiClient.get('/preferences', {
            schema: userPreferencesSchema,
        })).resolves.toMatchObject({ user_id: 1 });
        expect(authorizationHeaders).toEqual(['Bearer token-a', 'Bearer token-a-refreshed']);
        expect(getSessionSnapshot()).toMatchObject({
            token: 'token-a-refreshed',
            user: { id: 1 },
            bootstrapStatus: 'authenticated',
        });
    });
});
