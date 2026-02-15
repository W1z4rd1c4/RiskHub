import {
    PublicClientApplication,
    type AccountInfo,
    type AuthenticationResult,
    type PopupRequest,
    type RedirectRequest,
    type SilentRequest,
} from '@azure/msal-browser';

import { clearAuthConfigCache, getAuthConfig } from '@/services/authConfig';

let msalApp: PublicClientApplication | null = null;
let msalKey: string | null = null;

function getRedirectUri(): string {
    return `${window.location.origin}/auth/sso/callback`;
}

function sanitizeReturnTo(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    return '/';
}

function pickAccount(accounts: AccountInfo[], activeAccount: AccountInfo | null): AccountInfo | null {
    if (activeAccount) return activeAccount;
    if (accounts.length === 0) return null;
    return accounts[0] ?? null;
}

async function getMsalApp(): Promise<{ app: PublicClientApplication; scopes: string[] }> {
    const config = await getAuthConfig();
    if (!config.sso?.enabled || !config.sso.authority || !config.sso.client_id) {
        throw new Error('SSO is disabled');
    }

    const redirectUri = getRedirectUri();
    const key = `${config.sso.authority}|${config.sso.client_id}|${redirectUri}`;

    if (!msalApp || msalKey !== key) {
        msalKey = key;
        const app = new PublicClientApplication({
            auth: {
                authority: config.sso.authority,
                clientId: config.sso.client_id,
                redirectUri,
                navigateToLoginRequestUrl: false,
            },
            cache: {
                cacheLocation: 'localStorage',
            },
        });

        // Support MSAL versions that require an explicit initialize() call.
        const maybeInitialize = (app as unknown as { initialize?: () => Promise<void> }).initialize;
        if (typeof maybeInitialize === 'function') {
            await maybeInitialize.call(app);
        }

        msalApp = app;
    }

    return { app: msalApp, scopes: config.sso.scopes?.length ? config.sso.scopes : ['openid', 'profile', 'email'] };
}

function ensureActiveAccount(app: PublicClientApplication): AccountInfo | null {
    const active = app.getActiveAccount();
    const accounts = app.getAllAccounts();
    const selected = pickAccount(accounts, active);
    if (selected && selected !== active) {
        app.setActiveAccount(selected);
    }
    return selected;
}

export const entraAuth = {
    async isConfigured(): Promise<boolean> {
        const config = await getAuthConfig().catch(() => null);
        return Boolean(config?.sso?.enabled && config.sso.authority && config.sso.client_id);
    },

    async loginRedirect(returnTo?: string): Promise<void> {
        const { app, scopes } = await getMsalApp();
        const state = sanitizeReturnTo(returnTo);
        const request: RedirectRequest = {
            redirectUri: getRedirectUri(),
            scopes,
            ...(state ? { state } : {}),
        };
        await app.loginRedirect(request);
    },

    async loginPopup(): Promise<AuthenticationResult> {
        const { app, scopes } = await getMsalApp();
        const request: PopupRequest = {
            redirectUri: getRedirectUri(),
            scopes,
        };
        const result = await app.loginPopup(request);
        if (result.account) {
            app.setActiveAccount(result.account);
        }
        return result;
    },

    async handleRedirect(): Promise<AuthenticationResult | null> {
        const { app } = await getMsalApp();
        const result = await app.handleRedirectPromise();
        if (result?.account) {
            app.setActiveAccount(result.account);
        } else {
            ensureActiveAccount(app);
        }
        return result ?? null;
    },

    async acquireIdTokenSilent(): Promise<string | null> {
        const { app, scopes } = await getMsalApp();
        const account = ensureActiveAccount(app);
        if (!account) {
            return null;
        }

        const request: SilentRequest = { scopes, account };
        const result = await app.acquireTokenSilent(request);
        return result.idToken || null;
    },

    __resetForTests(): void {
        clearAuthConfigCache();
        msalApp = null;
        msalKey = null;
    },
};
