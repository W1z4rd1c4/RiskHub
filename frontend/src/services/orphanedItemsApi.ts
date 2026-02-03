import { apiClient } from './apiClient';
import type { OrphanedItem, OrphanStats, ResolveOrphanRequest } from '../types/orphanedItem';

export const orphanedItemsApi = {
    getOrphanedItems: (params?: { item_type?: string; status?: string }) =>
        apiClient.get<OrphanedItem[]>('/orphaned-items/', { params }),

    scanOrphans: () =>
        apiClient.post<{ flagged: number }>('/orphaned-items/scan', {}),

    getOrphanStats: () =>
        apiClient.get<OrphanStats>('/orphaned-items/stats'),

    getOrphanDetail: (id: number) =>
        apiClient.get<OrphanedItem>(`/orphaned-items/${id}`),

    resolveOrphan: (id: number, data: ResolveOrphanRequest) =>
        apiClient.post<{ status: string; orphan_id: number; new_owner_id: number }>(`/orphaned-items/${id}/resolve`, data),
};
