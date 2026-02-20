/**
 * Authentication API client for JWT-based authentication
 */

import { clearAccessToken, getAccessToken } from '@/services/accessTokenStore';

const API_URL = '/api/v1/auth';

export type AuthMode = 'password' | 'microsoft_sso' | 'hybrid_dev';

export interface LoginRequest {
    email: string;
    password: string;
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

export const authApi = {
    async getAuthConfig(): Promise<AuthConfigResponse> {
        const response = await fetch(`${API_URL}/config`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error((error as { detail?: string }).detail || 'Failed to get auth config');
        }

        return response.json();
    },

    async login(credentials: LoginRequest): Promise<TokenResponse> {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Login failed');
        }

        return response.json();
    },

    async ssoExchange(idToken: string): Promise<TokenResponse> {
        const response = await fetch(`${API_URL}/sso/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_token: idToken }),
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const detail = typeof (error as { detail?: unknown }).detail === 'string' ? String((error as { detail: string }).detail) : 'SSO exchange failed';
            throw new Error(detail);
        }

        return response.json();
    },

    async getCurrentUser(token: string): Promise<TokenResponse['user']> {
        const response = await fetch(`${API_URL}/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error('Failed to get current user');
        }

        return response.json();
    },

    async refresh(): Promise<TokenResponse> {
        const response = await fetch(`${API_URL}/refresh`, {
            method: 'POST',
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error((error as { detail?: string }).detail || 'Refresh failed');
        }

        return response.json();
    },

    async logoutAll(): Promise<void> {
        const accessToken = getAccessToken();
        const response = await fetch(`${API_URL}/logout-all`, {
            method: 'POST',
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error((error as { detail?: string }).detail || 'Logout all failed');
        }
        clearAccessToken();
    },

    async logout(): Promise<void> {
        await fetch(`${API_URL}/logout`, {
            method: 'POST',
            credentials: 'include',
        }).catch(() => null);

        clearAccessToken();
    },
};
