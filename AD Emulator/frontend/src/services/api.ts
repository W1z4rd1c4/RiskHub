import type { DirectoryUser, DirectoryUserCreate, DirectoryUserUpdate } from '../types/directory';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        headers: {
            'Content-Type': 'application/json',
        },
        ...options,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

export const api = {
    // Health check
    async healthCheck(): Promise<{ status: string; service: string }> {
        return request('/health');
    },

    // List all directory users
    async listUsers(filters?: { email?: string; department?: string; active?: boolean }): Promise<DirectoryUser[]> {
        const params = new URLSearchParams();
        if (filters?.email) params.set('email', filters.email);
        if (filters?.department) params.set('department', filters.department);
        if (typeof filters?.active === 'boolean') params.set('active', String(filters.active));

        const query = params.toString();
        return request(`/users/${query ? `?${query}` : ''}`);
    },

    // Get single user by external_id
    async getUser(externalId: string): Promise<DirectoryUser> {
        return request(`/users/${externalId}`);
    },

    // Create a new user
    async createUser(data: DirectoryUserCreate): Promise<DirectoryUser> {
        return request('/users/', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    // Update a user
    async updateUser(id: number, data: DirectoryUserUpdate): Promise<DirectoryUser> {
        return request(`/users/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },

    // Deactivate a user (soft delete)
    async deactivateUser(id: number): Promise<DirectoryUser> {
        return request(`/users/${id}`, {
            method: 'DELETE',
        });
    },

    // Activate a user
    async activateUser(id: number): Promise<DirectoryUser> {
        return request(`/users/${id}/activate`, {
            method: 'POST',
        });
    },
};
