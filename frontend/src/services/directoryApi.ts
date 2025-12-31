import { apiClient } from './apiClient';
import type {
    DirectorySyncPreview,
    DirectorySyncLogRead,
} from '@/types/directory';

export const directoryApi = {
    async previewDirectorySync() {
        return apiClient.post<DirectorySyncPreview>('/directory/sync/preview', {});
    },

    async applyDirectorySync() {
        return apiClient.post<DirectorySyncPreview>('/directory/sync/apply', {});
    },

    async listDirectorySyncHistory() {
        return apiClient.get<DirectorySyncLogRead[]>('/directory/sync/history');
    },
};
