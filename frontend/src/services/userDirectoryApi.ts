import { apiClient } from './apiClient';
import type { UserDirectoryListResponse } from '@/types/user';

export const userDirectoryApi = {
    async listDirectoryUsers(params?: {
        q?: string;
        role_name?: string;
        include_inactive?: boolean;
        department_id?: number;
        skip?: number;
        limit?: number;
    }) {
        return apiClient.get<UserDirectoryListResponse>('/users/directory', { params });
    },
};
