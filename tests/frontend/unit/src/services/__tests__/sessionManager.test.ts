import { afterEach, describe, expect, it } from 'vitest';

import { clearAccessToken, setAccessToken } from '@/services/accessTokenStore';
import { clearAuthenticatedSession, applyAuthenticatedSession } from '@/services/sessionManager';
import { __resetSessionStoreForTests, getSessionSnapshot } from '@/services/sessionStore';

const AUTH_RESPONSE = {
    access_token: 'riskhub-jwt',
    token_type: 'bearer',
    user: {
        id: 1,
        email: 'admin@riskhub.local',
        name: 'System Admin',
        role: 'administrator',
        role_display_name: 'Administrator',
        permissions: ['users:read'],
        effective_permissions: ['users:read'],
        access_scope: 'global' as const,
        scope_label: 'Global',
    },
};

afterEach(() => {
    __resetSessionStoreForTests();
});

describe('sessionManager', () => {
    it('applies one coherent authenticated session snapshot', () => {
        applyAuthenticatedSession(AUTH_RESPONSE);

        expect(getSessionSnapshot()).toMatchObject({
            token: 'riskhub-jwt',
            user: { email: 'admin@riskhub.local' },
            bootstrapStatus: 'authenticated',
            bootstrapError: null,
            logoutPending: false,
            logoutErrorKey: null,
        });
    });

    it('clears the canonical session snapshot coherently', () => {
        applyAuthenticatedSession(AUTH_RESPONSE);

        clearAuthenticatedSession({ clearBootstrap: true });

        expect(getSessionSnapshot()).toMatchObject({
            token: null,
            user: null,
            bootstrapStatus: 'anonymous',
            bootstrapError: null,
            logoutPending: false,
            logoutErrorKey: null,
        });
    });

    it('does not preserve a stale user when only a new raw token is injected', () => {
        applyAuthenticatedSession(AUTH_RESPONSE);

        setAccessToken('replacement-token');

        expect(getSessionSnapshot()).toMatchObject({
            token: 'replacement-token',
            user: null,
            bootstrapStatus: 'loading',
        });

        clearAccessToken();
        expect(getSessionSnapshot()).toMatchObject({
            token: null,
            user: null,
            bootstrapStatus: 'anonymous',
        });
    });
});
