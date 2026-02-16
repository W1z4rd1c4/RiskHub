import { apiClient } from '@/services/apiClient';
import type { DirectoryImportResponse, DirectoryUser } from '@/types/directory';

export const directoryApi = {
    searchUsers(q: string, limit = 25) {
        return apiClient.get<DirectoryUser[]>('/directory/users/search', { params: { q, limit } });
    },

    getUser(oid: string) {
        return apiClient.get<DirectoryUser>(`/directory/users/${oid}`);
    },

    importUser(oid: string, roleId?: number) {
        const payload = roleId ? { role_id: roleId } : {};
        return apiClient.post<DirectoryImportResponse>(`/directory/users/${oid}/import`, payload);
    },
};
