import { apiClient } from './apiClient';
import {
    userLookupArraySchema,
    userReadArraySchema,
    userReadSchema,
    userShellSummarySchema,
    voidSchema,
} from '@/services/api/schemas';
import type { UserCreate, UserUpdate } from '../types/user';

export const userApi = {
    async listUsers(skip = 0, limit = 100, departmentId?: number, roleId?: number) {
        const params: Record<string, string | number> = { skip, limit };
        if (departmentId) params.department_id = departmentId;
        if (roleId) params.role_id = roleId;

        return apiClient.get('/users', { params, schema: userReadArraySchema });
    },

    async createUser(userData: UserCreate) {
        return apiClient.post('/users', userData, { schema: userReadSchema });
    },

    async updateUser(userId: number, userData: UserUpdate) {
        return apiClient.patch(`/users/${userId}`, userData, { schema: userReadSchema });
    },

    async deleteUser(userId: number) {
        return apiClient.delete(`/users/${userId}`, { schema: voidSchema });
    },

    async listSubordinates(userId: number) {
        return apiClient.get(`/users/${userId}/subordinates`, { schema: userReadArraySchema });
    },

    /**
     * Scoped user lookup for pickers/dropdowns.
     * Returns users visible to the current user based on their access scope.
     */
    async listVisibleUsers(params?: { q?: string; include_inactive?: boolean; department_id?: number; skip?: number; limit?: number }) {
        return apiClient.get('/users/lookup', { params, schema: userLookupArraySchema });
    },

    async getShellSummary(options?: { signal?: AbortSignal }) {
        return apiClient.get('/users/me/shell-summary', {
            ...options,
            schema: userShellSummarySchema,
        });
    }
};
