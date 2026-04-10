import {
    PublicClientApplication,
    type AccountInfo,
    type AuthenticationResult,
    type EndSessionRequest,
    type RedirectRequest,
} from '@azure/msal-browser';

import { clearAuthConfigCache, getAuthConfig } from '@/services/authConfig';

let msalApp: PublicClientApplication | null = null;
let msalKey: string | null = null;

function getRedirectUri(): string {
    return `${window.location.origin}/auth/sso/callback`;
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
            },
            cache: {
                cacheLocation: 'sessionStorage',
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

function getLogoutHint(account: AccountInfo | null): string | undefined {
    if (!account) {
        return undefined;
    }

    const claims = (account.idTokenClaims ?? {}) as Record<string, unknown>;
    const claimLogoutHint = claims.login_hint;
    if (typeof claimLogoutHint === 'string' && claimLogoutHint) {
        return claimLogoutHint;
    }

    const preferredUsername = claims.preferred_username;
    if (typeof preferredUsername === 'string' && preferredUsername) {
        return preferredUsername;
    }

    return account.username || undefined;
}

export const entraAuth = {
    async isConfigured(): Promise<boolean> {
        const config = await getAuthConfig().catch(() => null);
        return Boolean(config?.sso?.enabled && config.sso.authority && config.sso.client_id);
    },

    async loginRedirect({
        nonce,
        state,
    }: {
        nonce: string;
        state: string;
    }): Promise<void> {
        const { app, scopes } = await getMsalApp();
        const request: RedirectRequest = {
            redirectUri: getRedirectUri(),
            scopes,
            state,
            nonce,
        };
        await app.loginRedirect(request);
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

    async logoutRedirect(): Promise<void> {
        const { app } = await getMsalApp();
        const account = ensureActiveAccount(app);
        const request: EndSessionRequest = {
            account: account ?? undefined,
            logoutHint: getLogoutHint(account),
            postLogoutRedirectUri: `${window.location.origin}/login`,
        };
        await app.logoutRedirect(request);
    },

    __resetForTests(): void {
        clearAuthConfigCache();
        msalApp = null;
        msalKey = null;
    },
};
