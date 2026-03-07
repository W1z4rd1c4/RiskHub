import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAccessToken, setAccessToken } from '@/services/accessTokenStore';
import { clearAuthConfigCache, getAuthConfig } from '@/services/authConfig';
import { AUTH_REQUEST_TIMEOUT_MS } from '@/services/authRequest';
import { authApi } from '@/services/authApi';
import { __resetAuthSessionCoordinatorForTests, bootstrapAuthSession, clearBootstrapSession } from '@/services/authSessionCoordinator';
import { __resetSsoSessionForTests, silentReauthAndExchange } from '@/services/ssoSession';

vi.mock('@/services/entraAuth', () => ({
    entraAuth: {
        acquireIdTokenSilent: vi.fn(),
    },
}));

function createAbortablePendingResponse(signal?: AbortSignal): Promise<Response> {
    return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
        }, { once: true });
    });
}

describe('auth timeout and retry flow', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        clearAccessToken();
        clearAuthConfigCache();
        clearBootstrapSession();
        __resetAuthSessionCoordinatorForTests();
        __resetSsoSessionForTests();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        clearAccessToken();
        clearAuthConfigCache();
        clearBootstrapSession();
        __resetAuthSessionCoordinatorForTests();
        __resetSsoSessionForTests();
    });

    it('times out auth config requests and clears the shared in-flight cache for retry', async () => {
        let configCalls = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (!url.endsWith('/api/v1/auth/config')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            configCalls += 1;
            if (configCalls === 1) {
                return createAbortablePendingResponse(init?.signal as AbortSignal | undefined);
            }
            return Promise.resolve(new Response(JSON.stringify({
                auth_mode: 'hybrid_dev',
                demo_login_enabled: true,
                password_login_enabled: true,
                sso: {
                    enabled: false,
                    provider: 'entra',
                    scopes: ['openid', 'profile', 'email'],
                },
                sso_error: null,
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        });

        const firstAttempt = getAuthConfig();
        const firstAttemptExpectation = expect(firstAttempt).rejects.toMatchObject({ code: 'AUTH_REQUEST_TIMEOUT' });
        await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS);
        await firstAttemptExpectation;

        const secondAttempt = getAuthConfig();
        await expect(secondAttempt).resolves.toMatchObject({ auth_mode: 'hybrid_dev' });
        expect(configCalls).toBe(2);
    });

    it('times out bootstrap current-user fetches and allows a fresh bootstrap retry', async () => {
        setAccessToken('stale-token');

        let meCalls = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.endsWith('/api/v1/auth/me')) {
                meCalls += 1;
                if (meCalls === 1) {
                    return createAbortablePendingResponse(init?.signal as AbortSignal | undefined);
                }
                return Promise.resolve(new Response(JSON.stringify({
                    id: 1,
                    email: 'admin@riskhub.local',
                    name: 'System Admin',
                    role: 'administrator',
                    role_display_name: 'Administrator',
                    permissions: [],
                    effective_permissions: [],
                    access_scope: 'global',
                    scope_label: 'Global',
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }

            if (url.endsWith('/api/v1/auth/refresh') || url.endsWith('/api/v1/auth/config')) {
                return createAbortablePendingResponse(init?.signal as AbortSignal | undefined);
            }

            if (url.endsWith('/api/v1/auth/sso/exchange')) {
                return createAbortablePendingResponse(init?.signal as AbortSignal | undefined);
            }

            if (url.endsWith('/auth/sso/callback')) {
                return Promise.resolve(new Response(null, { status: 200 }));
            }

            if (!url.endsWith('/api/v1/auth/me')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            throw new Error(`Unexpected fetch call: ${url}`);
        });

        const firstAttempt = bootstrapAuthSession();
        const firstAttemptExpectation = expect(firstAttempt).rejects.toMatchObject({ code: 'AUTH_REQUEST_TIMEOUT' });
        await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS);
        await firstAttemptExpectation;

        await expect(bootstrapAuthSession()).resolves.toMatchObject({
            token: 'stale-token',
            user: { email: 'admin@riskhub.local' },
        });
        expect(meCalls).toBe(2);
    });

    it('times out refresh requests and clears refresh dedupe state for retry', async () => {
        let refreshCalls = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (!url.endsWith('/api/v1/auth/refresh')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            refreshCalls += 1;
            if (refreshCalls === 1) {
                return createAbortablePendingResponse(init?.signal as AbortSignal | undefined);
            }
            return Promise.resolve(new Response(JSON.stringify({
                access_token: 'refreshed-token',
                token_type: 'bearer',
                user: {
                    id: 1,
                    email: 'admin@riskhub.local',
                    name: 'System Admin',
                    role: 'administrator',
                    role_display_name: 'Administrator',
                    permissions: [],
                    effective_permissions: [],
                    access_scope: 'global',
                    scope_label: 'Global',
                },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        });

        const firstAttempt = silentReauthAndExchange();
        const firstAttemptExpectation = expect(firstAttempt).rejects.toMatchObject({ code: 'AUTH_REQUEST_TIMEOUT' });
        await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS);
        await firstAttemptExpectation;

        await expect(silentReauthAndExchange()).resolves.toBe('refreshed-token');
        expect(refreshCalls).toBe(2);
    });

    it('times out raw auth API calls instead of waiting indefinitely', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (!url.endsWith('/api/v1/auth/me')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return createAbortablePendingResponse(init?.signal as AbortSignal | undefined);
        });

        const request = authApi.getCurrentUser('stale-token');
        const requestExpectation = expect(request).rejects.toMatchObject({ code: 'AUTH_REQUEST_TIMEOUT' });
        await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS);
        await requestExpectation;
    });
});
