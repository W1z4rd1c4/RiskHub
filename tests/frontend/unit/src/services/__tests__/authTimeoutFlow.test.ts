import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { clearAuthConfigCache, getAuthConfig } from '@/services/authConfig';
import { AUTH_REQUEST_TIMEOUT_MS } from '@/services/authRequest';
import { authApi } from '@/services/authApi';
import { __resetAuthSessionCoordinatorForTests, bootstrapAuthSession, clearBootstrapSession } from '@/services/session/bootstrap';
import { __setCsrfTokenForTests, clearCsrfToken } from '@/services/csrfToken';
import {
    __resetExplicitLogoutSuppressionForTests,
    setExplicitLogoutSuppressed,
} from '@/services/session/logoutSuppression';
import {
    __setRefreshSessionHintForTests,
    clearRefreshSessionHint,
} from '@/services/session/refreshHint';
import { __resetSilentSessionRefreshForTests, trySilentSessionRefresh } from '@/services/session/sso';

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
        clearCsrfToken();
        clearRefreshSessionHint();
        __resetExplicitLogoutSuppressionForTests();
        __resetAuthSessionCoordinatorForTests();
        __resetSilentSessionRefreshForTests();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        clearAccessToken();
        clearAuthConfigCache();
        clearBootstrapSession();
        clearCsrfToken();
        clearRefreshSessionHint();
        __resetExplicitLogoutSuppressionForTests();
        __resetAuthSessionCoordinatorForTests();
        __resetSilentSessionRefreshForTests();
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
                    tenant_id: null,
                    client_id: null,
                    authority: null,
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

    it('times out demo login requests and allows a fresh retry', async () => {
        let demoLoginCalls = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (!url.endsWith('/api/v1/auth/demo-login')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            demoLoginCalls += 1;
            if (demoLoginCalls === 1) {
                return createAbortablePendingResponse(init?.signal as AbortSignal | undefined);
            }
            return Promise.resolve(new Response(JSON.stringify({
                access_token: 'demo-token',
                token_type: 'bearer',
                user: {
                    id: 1,
                    email: 'admin@riskhub.local',
                    name: 'System Admin',
                    role: 'administrator',
                    role_display_name: 'Administrator',
                    department_id: null,
                    department_name: null,
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

        const firstAttempt = authApi.demoLogin('admin@riskhub.local');
        const firstAttemptExpectation = expect(firstAttempt).rejects.toMatchObject({ code: 'AUTH_REQUEST_TIMEOUT' });
        await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS);
        await firstAttemptExpectation;

        await expect(authApi.demoLogin('admin@riskhub.local')).resolves.toMatchObject({
            access_token: 'demo-token',
            user: { email: 'admin@riskhub.local' },
        });
        expect(demoLoginCalls).toBe(2);
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
                    department_id: null,
                    department_name: null,
                    permissions: [],
                    effective_permissions: [],
                    access_scope: 'global',
                    scope_label: 'Global',
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }

            if (
                url.endsWith('/api/v1/auth/refresh')
                || url.endsWith('/api/v1/auth/config')
                || url.endsWith('/api/v1/auth/csrf')
            ) {
                return createAbortablePendingResponse(init?.signal as AbortSignal | undefined);
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

    it('does not probe refresh during anonymous bootstrap when no session hint exists', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
            throw new Error('bootstrap should not fetch auth endpoints without a token or session hint');
        });

        await expect(bootstrapAuthSession()).resolves.toEqual({ token: null, user: null });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('restores a hinted refresh session during bootstrap reload', async () => {
        __setRefreshSessionHintForTests();

        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.endsWith('/api/v1/auth/csrf')) {
                __setCsrfTokenForTests('bootstrap-csrf-token');
                return Promise.resolve(new Response(null, { status: 204 }));
            }
            if (url.endsWith('/api/v1/auth/refresh')) {
                return Promise.resolve(new Response(JSON.stringify({
                    access_token: 'refreshed-token',
                    token_type: 'bearer',
                    user: {
                        id: 1,
                        email: 'admin@riskhub.local',
                        name: 'System Admin',
                        role: 'administrator',
                        role_display_name: 'Administrator',
                        department_id: null,
                        department_name: null,
                        permissions: [],
                        effective_permissions: [],
                        access_scope: 'global',
                        scope_label: 'Global',
                    },
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }
            if (url.endsWith('/api/v1/auth/me')) {
                return Promise.resolve(new Response(JSON.stringify({
                    id: 1,
                    email: 'admin@riskhub.local',
                    name: 'System Admin',
                    role: 'administrator',
                    role_display_name: 'Administrator',
                    department_id: null,
                    department_name: null,
                    permissions: [],
                    effective_permissions: [],
                    access_scope: 'global',
                    scope_label: 'Global',
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }
            throw new Error(`Unexpected fetch call: ${url}`);
        });

        await expect(bootstrapAuthSession()).resolves.toMatchObject({
            token: 'refreshed-token',
            user: { email: 'admin@riskhub.local' },
        });
    });

    it('seeds the CSRF cookie through the dedicated auth endpoint', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (!url.endsWith('/api/v1/auth/csrf')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            __setCsrfTokenForTests('seeded-csrf-token');
            return Promise.resolve(new Response(null, { status: 204 }));
        });

        await expect(authApi.ensureCsrf()).resolves.toBeUndefined();
        expect(document.cookie).toContain('riskhub_csrf_token=seeded-csrf-token');
    });

    it('retries refresh once after a csrf validation failure', async () => {
        let refreshCalls = 0;
        let csrfCalls = 0;

        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.endsWith('/api/v1/auth/csrf')) {
                csrfCalls += 1;
                __setCsrfTokenForTests(csrfCalls === 1 ? 'stale-csrf-token' : 'fresh-csrf-token');
                return Promise.resolve(new Response(null, { status: 204 }));
            }
            if (url.endsWith('/api/v1/auth/refresh')) {
                refreshCalls += 1;
                if (refreshCalls === 1) {
                    return Promise.resolve(new Response(JSON.stringify({
                        code: 'csrf_validation_failed',
                        detail: 'CSRF validation failed.',
                    }), {
                        status: 403,
                        headers: { 'Content-Type': 'application/json' },
                    }));
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
                        department_id: null,
                        department_name: null,
                        permissions: [],
                        effective_permissions: [],
                        access_scope: 'global',
                        scope_label: 'Global',
                    },
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }
            throw new Error(`Unexpected fetch call: ${url}`);
        });

        await expect(authApi.refresh()).resolves.toMatchObject({
            access_token: 'refreshed-token',
            user: { email: 'admin@riskhub.local' },
        });
        expect(csrfCalls).toBe(2);
        expect(refreshCalls).toBe(2);
    });

    it('times out silent session refresh requests and clears refresh dedupe state for retry', async () => {
        __setRefreshSessionHintForTests();

        let refreshCalls = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.endsWith('/api/v1/auth/csrf')) {
                __setCsrfTokenForTests('refresh-csrf-token');
                return Promise.resolve(new Response(null, { status: 204 }));
            }
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
                    department_id: null,
                    department_name: null,
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

        const firstAttempt = trySilentSessionRefresh();
        const firstAttemptExpectation = expect(firstAttempt).rejects.toMatchObject({ code: 'AUTH_REQUEST_TIMEOUT' });
        await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS);
        await firstAttemptExpectation;

        await expect(trySilentSessionRefresh()).resolves.toBe('refreshed-token');
        expect(refreshCalls).toBe(2);
    });

    it('clears the session hint after a failed refresh and skips subsequent anonymous probes', async () => {
        __setRefreshSessionHintForTests();

        let refreshCalls = 0;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (url.endsWith('/api/v1/auth/csrf')) {
                __setCsrfTokenForTests('failed-refresh-csrf-token');
                return Promise.resolve(new Response(null, { status: 204 }));
            }
            if (url.endsWith('/api/v1/auth/refresh')) {
                refreshCalls += 1;
                return Promise.resolve(new Response(JSON.stringify({ detail: 'Authentication required' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }
            if (
                !url.endsWith('/api/v1/auth/refresh')
                && !url.endsWith('/api/v1/auth/csrf')
            ) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            throw new Error(`Unexpected fetch call: ${url}`);
        });

        await expect(trySilentSessionRefresh()).resolves.toBeNull();
        expect(refreshCalls).toBe(1);
        expect(document.cookie).not.toContain('riskhub_refresh_hint=1');

        await expect(bootstrapAuthSession()).resolves.toEqual({ token: null, user: null });
        expect(refreshCalls).toBe(1);
    });

    it('suppresses bootstrap and silent session refresh after explicit logout', async () => {
        __setRefreshSessionHintForTests();
        __setCsrfTokenForTests();
        setExplicitLogoutSuppressed();

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
            throw new Error('auth flows should not fetch while explicit logout suppression is active');
        });

        await expect(trySilentSessionRefresh()).resolves.toBeNull();
        await expect(bootstrapAuthSession()).resolves.toEqual({ token: null, user: null });
        expect(fetchSpy).not.toHaveBeenCalled();
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
