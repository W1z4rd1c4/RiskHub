import { apiClient } from './apiClient';
import type { UserRead, UserCreate, UserUpdate, Role } from '../types/user';

export const userApi = {
    async listUsers(skip = 0, limit = 100, departmentId?: number, roleId?: number) {
        const params: Record<string, string | number> = { skip, limit };
        if (departmentId) params.department_id = departmentId;
        if (roleId) params.role_id = roleId;

        return apiClient.get<UserRead[]>('/users', { params });
    },

    async getUser(userId: number) {
        return apiClient.get<UserRead>(`/users/${userId}`);
    },

    async createUser(userData: UserCreate) {
        return apiClient.post<UserRead>('/users', userData);
    },

    async updateUser(userId: number, userData: UserUpdate) {
        return apiClient.patch<UserRead>(`/users/${userId}`, userData);
    },

    async deleteUser(userId: number) {
        return apiClient.delete<void>(`/users/${userId}`);
    },

    async listSubordinates(userId: number) {
        return apiClient.get<UserRead[]>(`/users/${userId}/subordinates`);
    },

    /**
     * Scoped user lookup for pickers/dropdowns.
     * Returns users visible to the current user based on their access scope.
     */
    async listVisibleUsers(params?: { q?: string; include_inactive?: boolean; skip?: number; limit?: number }) {
        return apiClient.get<{ id: number; name: string; email: string; role_name?: string; department_id?: number; department_name?: string; manager_id?: number }[]>('/users/lookup', { params });
    },

    async listRoles() {
        return apiClient.get<Role[]>('/users/roles');
    }
};
