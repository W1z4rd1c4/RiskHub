/**
 * Authentication API client for JWT-based authentication
 */

import { clearAccessToken, getAccessToken } from '@/services/accessTokenStore';
import { clearCsrfToken, getCsrfToken } from '@/services/csrfToken';
import { AuthRequestError, fetchAuthResponse } from '@/services/authRequest';
import { clearRefreshSessionHint } from '@/services/refreshSessionHint';

const API_URL = '/api/v1/auth';

export type AuthMode = 'password' | 'microsoft_sso' | 'hybrid_dev';

export interface LoginRequest {
    email: string;
    password: string;
}

export interface DemoLoginRequest {
    email: string;
}

export interface DemoPersona {
    section: 'privileged' | 'department_heads' | 'employees';
    name: string;
    email: string;
    role_key: string;
    dept_key?: string | null;
    color: 'rose' | 'purple' | 'violet' | 'amber' | 'emerald' | 'sky' | 'teal' | 'indigo' | 'pink';
}

export interface AuthConfigResponse {
    auth_mode: AuthMode;
    demo_login_enabled: boolean;
    password_login_enabled: boolean;
    sso: {
        enabled: boolean;
        provider: 'entra';
        tenant_id?: string;
        client_id?: string;
        authority?: string;
        scopes: string[];
    };
    sso_error?: string | null;
    demo_personas?: DemoPersona[];
}

export interface TokenResponse {
    access_token: string;
    token_type: string;
    post_login_redirect_to?: string | null;
    user: {
        id: number;
        email: string;
        name: string;
        role: string;
        role_display_name: string;
        department_id?: number;
        department_name?: string;
        permissions: string[];
        effective_permissions: string[];
        access_scope: 'global' | 'department' | 'manager';
        scope_label: string;
    };
}

export type AuthUser = TokenResponse['user'];

interface ParsedAuthError {
    detail: string;
    code?: string;
}

async function parseAuthError(response: Response, fallbackMessage: string): Promise<ParsedAuthError> {
    const error = await response.json().catch(() => ({}));
    const detail = (error as { detail?: string }).detail || fallbackMessage;
    const code = typeof (error as { code?: unknown }).code === 'string'
        ? String((error as { code: string }).code)
        : undefined;
    return { detail, code };
}

function buildAuthRequestError(response: Response, detail: string): AuthRequestError {
    return new AuthRequestError({
        code: response.status >= 500 ? 'AUTH_SERVICE_UNAVAILABLE' : 'AUTH_REQUEST_FAILED',
        message: detail,
        rawMessage: detail,
        status: response.status,
    });
}

async function requestAuthJson<T>(path: string, init: RequestInit, fallbackMessage: string): Promise<T> {
    const response = await fetchAuthResponse(`${API_URL}${path}`, init);
    if (!response.ok) {
        const { detail } = await parseAuthError(response, fallbackMessage);
        throw buildAuthRequestError(response, detail);
    }
    return response.json();
}

async function requestAuthVoid(path: string, init: RequestInit, fallbackMessage: string): Promise<void> {
    const response = await fetchAuthResponse(`${API_URL}${path}`, init);
    if (!response.ok) {
        const { detail } = await parseAuthError(response, fallbackMessage);
        throw buildAuthRequestError(response, detail);
    }
}

export const authApi = {
    async getAuthConfig(): Promise<AuthConfigResponse> {
        const response = await fetchAuthResponse(`${API_URL}/config`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        });

        if (!response.ok) {
            const { detail } = await parseAuthError(response, 'Failed to get auth config');
            throw new AuthRequestError({
                code: response.status >= 500 ? 'AUTH_SERVICE_UNAVAILABLE' : 'AUTH_CONFIG_LOAD_FAILED',
                message: detail,
                rawMessage: detail,
                status: response.status,
            });
        }

        return response.json();
    },

    async login(credentials: LoginRequest): Promise<TokenResponse> {
        return requestAuthJson<TokenResponse>('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
            credentials: 'include',
        }, 'Login failed');
    },

    async demoLogin(email: string): Promise<TokenResponse> {
        return requestAuthJson<TokenResponse>('/demo-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email } satisfies DemoLoginRequest),
            credentials: 'include',
        }, 'Demo login failed');
    },

    async ssoStart(returnTo?: string): Promise<{ nonce: string; state: string; expires_in: number }> {
        return requestAuthJson<{ nonce: string; state: string; expires_in: number }>('/sso/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ return_to: returnTo ?? '/' }),
            credentials: 'include',
        }, 'SSO start failed');
    },

    async ssoExchange(idToken: string, state?: string | null): Promise<TokenResponse> {
        return requestAuthJson<TokenResponse>('/sso/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state ? { id_token: idToken, state } : { id_token: idToken }),
            credentials: 'include',
        }, 'SSO exchange failed');
    },

    async getCurrentUser(token: string): Promise<TokenResponse['user']> {
        return requestAuthJson<TokenResponse['user']>('/me', {
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'include',
        }, 'Failed to get current user');
    },

    async refresh(): Promise<TokenResponse> {
        await this.ensureCsrf();
        const performRefresh = async (allowCsrfRetry: boolean): Promise<TokenResponse> => {
            const csrfToken = getCsrfToken();
            if (!csrfToken) {
                throw new AuthRequestError({
                    code: 'AUTH_REQUEST_FAILED',
                    message: 'CSRF token unavailable',
                    rawMessage: 'CSRF token unavailable',
                    status: 403,
                });
            }

            const response = await fetchAuthResponse(`${API_URL}/refresh`, {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrfToken },
                credentials: 'include',
            });

            if (!response.ok) {
                const parsedError = await parseAuthError(response, 'Refresh failed');
                if (allowCsrfRetry && response.status === 403 && parsedError.code === 'csrf_validation_failed') {
                    await this.ensureCsrf();
                    return performRefresh(false);
                }
                throw buildAuthRequestError(response, parsedError.detail);
            }

            return response.json();
        };

        return performRefresh(true);
    },

    async ensureCsrf(): Promise<void> {
        await requestAuthVoid('/csrf', {
            method: 'GET',
            credentials: 'include',
        }, 'Failed to initialize CSRF protection');

        if (!getCsrfToken()) {
            throw new AuthRequestError({
                code: 'AUTH_REQUEST_FAILED',
                message: 'Failed to initialize CSRF protection',
                rawMessage: 'Failed to initialize CSRF protection',
                status: 403,
            });
        }
    },

    async logoutAll(): Promise<void> {
        const accessToken = getAccessToken();
        await requestAuthVoid('/logout-all', {
            method: 'POST',
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            credentials: 'include',
        }, 'Logout all failed');
        clearAccessToken();
        clearRefreshSessionHint();
        clearCsrfToken();
    },

    async logout(): Promise<void> {
        const accessToken = getAccessToken();
        const headers = new Headers();
        if (accessToken) {
            headers.set('Authorization', `Bearer ${accessToken}`);
        }

        let csrfToken = getCsrfToken();
        if (!csrfToken) {
            await this.ensureCsrf();
            csrfToken = getCsrfToken();
        }
        if (csrfToken) {
            headers.set('X-CSRF-Token', csrfToken);
        }

        await requestAuthVoid('/logout', {
            method: 'POST',
            headers,
            credentials: 'include',
        }, 'Logout failed');
    },
};
