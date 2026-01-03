/**
 * Access management API client.
 * Endpoints require privileged user access.
 */
import { apiClient } from './apiClient';
import type { AccessUserRead, AccessUserUpdate, AccessUserFilters, RoleWithPermissions } from '@/types/access';

export const accessApi = {
    /**
     * List users for access management with optional filters.
     * Requires privileged access.
     */
    async listAccessUsers(filters?: AccessUserFilters): Promise<AccessUserRead[]> {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (filters?.department_id !== undefined) {
            params.department_id = filters.department_id;
        }
        if (filters?.role_id !== undefined) {
            params.role_id = filters.role_id;
        }
        if (filters?.access_scope !== undefined) {
            params.access_scope = filters.access_scope;
        }
        if (filters?.is_privileged !== undefined) {
            params.is_privileged = filters.is_privileged;
        }

        return apiClient.get<AccessUserRead[]>('/access/users', { params });
    },

    /**
     * List users in current user's department with access info.
     * Available to department heads and privileged users.
     */
    async listDepartmentAccessUsers(): Promise<AccessUserRead[]> {
        return apiClient.get<AccessUserRead[]>('/access/users/my-department');
    },

    /**
     * List roles with their permissions.
     * Requires privileged access.
     */
    async listAccessRoles(): Promise<RoleWithPermissions[]> {
        return apiClient.get<RoleWithPermissions[]>('/access/roles');
    },

    /**
     * Update access management fields for a user.
     * Requires privileged access. Admin/CRO required for access_scope changes.
     */
    async updateAccessUser(userId: number, data: AccessUserUpdate): Promise<AccessUserRead> {
        return apiClient.patch<AccessUserRead>(`/access/users/${userId}`, data);
    },
};
