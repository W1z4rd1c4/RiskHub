import { apiClient as api } from './apiClient';
import {
    activityLogListResponseSchema,
    stringArraySchema,
} from '@/services/api/schemas';
import type { RequestOptions } from '@/services/apiClient';
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
    async list(
        filters: ActivityLogFilters = {},
        options?: RequestOptions,
    ): Promise<ActivityLogListResponse> {
        return api.get('/activity-log', {
            ...options,
            params: filters as ActivityLogQueryParams,
            schema: activityLogListResponseSchema,
        });
    },

    async getEntityTypes(): Promise<string[]> {
        return api.get('/activity-log/entity-types', { schema: stringArraySchema });
    },

    async getActions(): Promise<string[]> {
        return api.get('/activity-log/actions', { schema: stringArraySchema });
    },
};
