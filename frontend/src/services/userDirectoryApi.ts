import { apiClient } from './apiClient';
import { userDirectoryListResponseSchema } from '@/services/api/schemas';

export const userDirectoryApi = {
    async listDirectoryUsers(params?: {
        q?: string;
        role_name?: string;
        include_inactive?: boolean;
        department_id?: number;
        skip?: number;
        limit?: number;
    }, options?: { signal?: AbortSignal }) {
        return apiClient.get('/users/directory', {
            ...options,
            params,
            schema: userDirectoryListResponseSchema,
        });
    },
};
