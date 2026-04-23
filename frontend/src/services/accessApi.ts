/**
 * Access management API client.
 * Endpoints require privileged user access. The backend conceals platform
 * Admin users and the Admin role from non-Admin callers.
 */
import { apiClient } from './apiClient';
import {
    accessUserReadArraySchema,
    accessUserReadSchema,
    roleWithPermissionsArraySchema,
} from '@/services/api/schemas';
import type { AccessUserRead, AccessUserUpdate, AccessUserFilters, RoleWithPermissions } from '@/types/access';

export const accessApi = {
    /**
     * List users for access management with optional filters.
     * Requires privileged access. Non-Admin callers do not receive platform
     * Admin users.
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

        return apiClient.get('/access/users', { params, schema: accessUserReadArraySchema });
    },

    /**
     * List users in current user's department with access info.
     * Available to department heads and privileged users.
     */
    async listDepartmentAccessUsers(): Promise<AccessUserRead[]> {
        return apiClient.get('/access/users/my-department', { schema: accessUserReadArraySchema });
    },

    /**
     * List roles with their permissions.
     * Requires privileged access. Non-Admin callers do not receive the Admin
     * role.
     */
    async listAccessRoles(): Promise<RoleWithPermissions[]> {
        return apiClient.get('/access/roles', { schema: roleWithPermissionsArraySchema });
    },

    /**
     * Update access management fields for a user.
     * Requires privileged access.
     * Admin owns identity/Admin-role fields; CRO owns business access fields.
     */
    async updateAccessUser(userId: number, data: AccessUserUpdate): Promise<AccessUserRead> {
        return apiClient.patch(`/access/users/${userId}`, data, { schema: accessUserReadSchema });
    },
};
