import { apiClient } from './apiClient';
import {
    orphanScanResponseSchema,
    orphanStatsSchema,
    orphanedItemArraySchema,
    orphanedItemSchema,
    orphanedItemsOverviewSchema,
    resolveOrphanResponseSchema,
} from '@/services/api/schemas';
import type { ResolveOrphanRequest } from '../types/orphanedItem';

export const orphanedItemsApi = {
    getOrphanedItems: (params?: { item_type?: string; status?: string }) =>
        apiClient.get('/orphaned-items/', { params, schema: orphanedItemArraySchema }),

    scanOrphans: () =>
        apiClient.post('/orphaned-items/scan', {}, { schema: orphanScanResponseSchema }),

    getOrphanStats: () =>
        apiClient.get('/orphaned-items/stats', { schema: orphanStatsSchema }),

    getOverview: (params?: { item_type?: string; status?: string }, options?: { signal?: AbortSignal }) =>
        apiClient.get('/orphaned-items/overview', {
            ...options,
            params,
            schema: orphanedItemsOverviewSchema,
        }),

    getOrphanDetail: (id: number) =>
        apiClient.get(`/orphaned-items/${id}`, { schema: orphanedItemSchema }),

    resolveOrphan: (id: number, data: ResolveOrphanRequest) =>
        apiClient.post(`/orphaned-items/${id}/resolve`, data, {
            schema: resolveOrphanResponseSchema,
        }),
};
