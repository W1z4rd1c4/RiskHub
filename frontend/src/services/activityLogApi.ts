import { apiClient as api } from './apiClient';
import type { ActivityLogListResponse } from '@/types/activityLog';

export interface ActivityLogFilters {
    entity_type?: string | string[];
    entity_id?: number;
    actor_id?: number;
    department_id?: number;
    action?: string;
    search?: string;
    date_from?: string;  // ISO date string
    date_to?: string;
    skip?: number;
    limit?: number;
}

export const activityLogApi = {
    async list(filters: ActivityLogFilters = {}): Promise<ActivityLogListResponse> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return api.get('/activity-log', { params: filters as any });
    },

    async getEntityTypes(): Promise<string[]> {
        return api.get('/activity-log/entity-types');
    },

    async getActions(): Promise<string[]> {
        return api.get('/activity-log/actions');
    },
};
