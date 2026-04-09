import { apiClient } from '@/services/apiClient';
import {
    directoryImportResponseSchema,
    directoryUserArraySchema,
    directoryUserSchema,
} from '@/services/api/schemas';

export const directoryApi = {
    searchUsers(q: string, limit = 25) {
        return apiClient.get('/directory/users/search', {
            params: { q, limit },
            schema: directoryUserArraySchema,
        });
    },

    getUser(oid: string) {
        return apiClient.get(`/directory/users/${oid}`, { schema: directoryUserSchema });
    },

    importUser(oid: string, roleId?: number) {
        const payload = roleId ? { role_id: roleId } : {};
        return apiClient.post(`/directory/users/${oid}/import`, payload, {
            schema: directoryImportResponseSchema,
        });
    },
};
