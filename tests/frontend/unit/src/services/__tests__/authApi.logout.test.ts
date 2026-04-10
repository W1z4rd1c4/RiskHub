import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAccessToken, getAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { authApi } from '@/services/authApi';
import { clearCsrfToken, __setCsrfTokenForTests } from '@/services/csrfToken';
import { clearRefreshSessionHint, __setRefreshSessionHintForTests } from '@/services/session/refreshHint';

describe('authApi logout responses', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        clearAccessToken();
        clearCsrfToken();
        clearRefreshSessionHint();
    });

    afterEach(() => {
        clearAccessToken();
        clearCsrfToken();
        clearRefreshSessionHint();
    });

    it('accepts logout-all JSON success payloads and clears local session state', async () => {
        setAccessToken('active-token');
        __setCsrfTokenForTests('logout-all-csrf-token');
        __setRefreshSessionHintForTests();

        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (!url.endsWith('/api/v1/auth/logout-all')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(new Response(JSON.stringify({
                message: 'Logged out from all devices',
                revoked_sessions: 3,
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        });

        await expect(authApi.logoutAll()).resolves.toBeUndefined();
        expect(getAccessToken()).toBeNull();
        expect(document.cookie).not.toContain('riskhub_refresh_hint=1');
        expect(document.cookie).not.toContain('riskhub_csrf_token=');
    });
});
