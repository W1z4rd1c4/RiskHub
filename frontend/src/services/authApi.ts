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
}

export interface TokenResponse {
    access_token: string;
    token_type: string;
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

async function parseAuthError(response: Response, fallbackMessage: string): Promise<{ detail: string; code?: string }> {
    const error = await response.json().catch(() => ({}));
    const detail = (error as { detail?: string }).detail || fallbackMessage;
    const code = typeof (error as { code?: unknown }).code === 'string'
        ? String((error as { code: string }).code)
        : undefined;
    return { detail, code };
}

export const authApi = {
    async getAuthConfig(): Promise<AuthConfigResponse> {
        const response = await fetchAuthResponse(`${API_URL}/config`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const detail = (error as { detail?: string }).detail || 'Failed to get auth config';
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
        const response = await fetchAuthResponse(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const detail = (error as { detail?: string }).detail || 'Login failed';
            throw new AuthRequestError({
                code: response.status >= 500 ? 'AUTH_SERVICE_UNAVAILABLE' : 'AUTH_REQUEST_FAILED',
                message: detail,
                rawMessage: detail,
                status: response.status,
            });
        }

        return response.json();
    },

    async demoLogin(email: string): Promise<TokenResponse> {
        const response = await fetchAuthResponse(`${API_URL}/demo-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email } satisfies DemoLoginRequest),
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const detail = (error as { detail?: string }).detail || 'Demo login failed';
            throw new AuthRequestError({
                code: response.status >= 500 ? 'AUTH_SERVICE_UNAVAILABLE' : 'AUTH_REQUEST_FAILED',
                message: detail,
                rawMessage: detail,
                status: response.status,
            });
        }

        return response.json();
    },

    async ssoExchange(idToken: string): Promise<TokenResponse> {
        const response = await fetchAuthResponse(`${API_URL}/sso/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_token: idToken }),
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const detail = typeof (error as { detail?: unknown }).detail === 'string' ? String((error as { detail: string }).detail) : 'SSO exchange failed';
            throw new AuthRequestError({
                code: response.status >= 500 ? 'AUTH_SERVICE_UNAVAILABLE' : 'AUTH_REQUEST_FAILED',
                message: detail,
                rawMessage: detail,
                status: response.status,
            });
        }

        return response.json();
    },

    async getCurrentUser(token: string): Promise<TokenResponse['user']> {
        const response = await fetchAuthResponse(`${API_URL}/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'include',
        });

        if (!response.ok) {
            throw new AuthRequestError({
                code: response.status >= 500 ? 'AUTH_SERVICE_UNAVAILABLE' : 'AUTH_REQUEST_FAILED',
                message: 'Failed to get current user',
                rawMessage: 'Failed to get current user',
                status: response.status,
            });
        }

        return response.json();
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
                const { detail, code } = await parseAuthError(response, 'Refresh failed');
                if (allowCsrfRetry && response.status === 403 && code === 'csrf_validation_failed') {
                    await this.ensureCsrf();
                    return performRefresh(false);
                }
                throw new AuthRequestError({
                    code: response.status >= 500 ? 'AUTH_SERVICE_UNAVAILABLE' : 'AUTH_REQUEST_FAILED',
                    message: detail,
                    rawMessage: detail,
                    status: response.status,
                });
            }

            return response.json();
        };

        return performRefresh(true);
    },

    async ensureCsrf(): Promise<void> {
        const response = await fetchAuthResponse(`${API_URL}/csrf`, {
            method: 'GET',
            credentials: 'include',
        });

        if (!response.ok) {
            const { detail } = await parseAuthError(response, 'Failed to initialize CSRF protection');
            throw new AuthRequestError({
                code: response.status >= 500 ? 'AUTH_SERVICE_UNAVAILABLE' : 'AUTH_REQUEST_FAILED',
                message: detail,
                rawMessage: detail,
                status: response.status,
            });
        }

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
        const response = await fetchAuthResponse(`${API_URL}/logout-all`, {
            method: 'POST',
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const detail = (error as { detail?: string }).detail || 'Logout all failed';
            throw new AuthRequestError({
                code: response.status >= 500 ? 'AUTH_SERVICE_UNAVAILABLE' : 'AUTH_REQUEST_FAILED',
                message: detail,
                rawMessage: detail,
                status: response.status,
            });
        }
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

        const response = await fetchAuthResponse(`${API_URL}/logout`, {
            method: 'POST',
            headers,
            credentials: 'include',
        });

        if (!response.ok) {
            const { detail } = await parseAuthError(response, 'Logout failed');
            throw new AuthRequestError({
                code: response.status >= 500 ? 'AUTH_SERVICE_UNAVAILABLE' : 'AUTH_REQUEST_FAILED',
                message: detail,
                rawMessage: detail,
                status: response.status,
            });
        }
    },
};
