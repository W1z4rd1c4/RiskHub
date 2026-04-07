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

type ActivityLogQueryParams = Record<string, string | number | boolean | string[] | null | undefined>;

export const activityLogApi = {
    async list(filters: ActivityLogFilters = {}): Promise<ActivityLogListResponse> {
        return api.get<ActivityLogListResponse>('/activity-log', {
            params: filters as ActivityLogQueryParams,
        });
    },

    async getEntityTypes(): Promise<string[]> {
        return api.get('/activity-log/entity-types');
    },

    async getActions(): Promise<string[]> {
        return api.get('/activity-log/actions');
    },
};
