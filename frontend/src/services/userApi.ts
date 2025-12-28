import { apiClient } from './apiClient';
import type { UserRead, UserCreate, UserUpdate } from '../types/user';

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

    async listRoles() { // Added helper for roles based on router
        return apiClient.get<any[]>('/users/roles');
    }
};
