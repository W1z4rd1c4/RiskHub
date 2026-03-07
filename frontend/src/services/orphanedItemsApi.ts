import { apiClient } from './apiClient';
import type { OrphanedItem, OrphanedItemsOverview, OrphanStats, ResolveOrphanRequest } from '../types/orphanedItem';

export const orphanedItemsApi = {
    getOrphanedItems: (params?: { item_type?: string; status?: string }) =>
        apiClient.get<OrphanedItem[]>('/orphaned-items/', { params }),

    scanOrphans: () =>
        apiClient.post<{ flagged: number }>('/orphaned-items/scan', {}),

    getOrphanStats: () =>
        apiClient.get<OrphanStats>('/orphaned-items/stats'),

    getOverview: (params?: { item_type?: string; status?: string }, options?: { signal?: AbortSignal }) =>
        apiClient.get<OrphanedItemsOverview>('/orphaned-items/overview', { ...options, params }),

    getOrphanDetail: (id: number) =>
        apiClient.get<OrphanedItem>(`/orphaned-items/${id}`),

    resolveOrphan: (id: number, data: ResolveOrphanRequest) =>
        apiClient.post<{ status: string; orphan_id: number; new_owner_id: number }>(`/orphaned-items/${id}/resolve`, data),
};
