import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    PublicClientApplicationMock,
    clearAuthConfigCacheMock,
    getAuthConfigMock,
    msalAppMock,
} = vi.hoisted(() => ({
    PublicClientApplicationMock: vi.fn(function PublicClientApplication() {}),
    clearAuthConfigCacheMock: vi.fn(),
    getAuthConfigMock: vi.fn(),
    msalAppMock: {
        initialize: vi.fn(async () => {}),
        loginRedirect: vi.fn(async () => {}),
        loginPopup: vi.fn(async () => ({ account: null })),
        handleRedirectPromise: vi.fn(async () => null),
        getActiveAccount: vi.fn(() => null),
        getAllAccounts: vi.fn(() => []),
        setActiveAccount: vi.fn(),
        acquireTokenSilent: vi.fn(async () => ({ idToken: 'id-token' })),
    },
}));

vi.mock('@azure/msal-browser', () => ({
    PublicClientApplication: PublicClientApplicationMock,
}));

vi.mock('@/services/authConfig', () => ({
    clearAuthConfigCache: clearAuthConfigCacheMock,
    getAuthConfig: getAuthConfigMock,
}));

import { entraAuth } from '@/services/entraAuth';

beforeEach(() => {
    PublicClientApplicationMock.mockClear();
    PublicClientApplicationMock.mockImplementation(function PublicClientApplication() {
        return msalAppMock;
    });

    clearAuthConfigCacheMock.mockReset();

    getAuthConfigMock.mockReset();
    getAuthConfigMock.mockResolvedValue({
        auth_mode: 'microsoft_sso',
        demo_login_enabled: false,
        password_login_enabled: false,
        sso: {
            enabled: true,
            provider: 'entra',
            tenant_id: 'tenant-id',
            client_id: 'client-id',
            authority: 'https://login.microsoftonline.com/tenant-id',
            scopes: ['openid', 'profile', 'email'],
        },
        sso_error: null,
    });

    msalAppMock.initialize.mockClear();
    msalAppMock.loginRedirect.mockClear();
    msalAppMock.loginPopup.mockClear();
    msalAppMock.handleRedirectPromise.mockClear();
    msalAppMock.getActiveAccount.mockClear();
    msalAppMock.getAllAccounts.mockClear();
    msalAppMock.setActiveAccount.mockClear();
    msalAppMock.acquireTokenSilent.mockClear();

    entraAuth.__resetForTests();
});

afterEach(() => {
    entraAuth.__resetForTests();
});

describe('entraAuth', () => {
    it('configures MSAL to use sessionStorage cache', async () => {
        await entraAuth.loginRedirect('/risks');

        expect(PublicClientApplicationMock).toHaveBeenCalledTimes(1);
        expect(PublicClientApplicationMock).toHaveBeenCalledWith({
            auth: {
                authority: 'https://login.microsoftonline.com/tenant-id',
                clientId: 'client-id',
                redirectUri: `${window.location.origin}/auth/sso/callback`,
            },
            cache: {
                cacheLocation: 'sessionStorage',
            },
        });
        expect(msalAppMock.initialize).toHaveBeenCalledTimes(1);
        expect(msalAppMock.loginRedirect).toHaveBeenCalledWith({
            redirectUri: `${window.location.origin}/auth/sso/callback`,
            scopes: ['openid', 'profile', 'email'],
            state: '/risks',
        });
    });
});
