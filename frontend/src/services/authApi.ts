/**
 * Authentication API client for JWT-based authentication
 */

const API_URL = '/api/v1/auth';

export interface LoginRequest {
    email: string;
    password: string;
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
    };
}

export const authApi = {
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
