/**
 * Authentication API client for JWT-based authentication
 */

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
    debug: boolean;
    mock_auth_enabled: boolean;
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
        });

        if (!response.ok) {
            throw new Error('Failed to get current user');
        }

        return response.json();
    },

    async logout(): Promise<void> {
        // Client-side logout (clear token)
        localStorage.removeItem('access_token');
    },
};
