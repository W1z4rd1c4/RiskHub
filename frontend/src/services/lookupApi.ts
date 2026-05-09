import { apiClient } from './apiClient';
import {
    departmentSummaryArraySchema,
    riskFiltersSchema,
    userLookupArraySchema,
} from '@/services/api/schemas';
import type { QueryValue } from './api/apiTypes';
import type { DepartmentSummary } from './departmentApi';

export interface UserLookupItem {
    id: number;
    name: string;
    email: string;
    role_name?: string | null;
    department_id?: number | null;
    department_name?: string | null;
    manager_id?: number | null;
}

export interface UserLookupParams extends Record<string, QueryValue> {
    department_id?: number;
    ids?: number[];
    include_inactive?: boolean;
    limit?: number;
    q?: string;
    skip?: number;
}

export const lookupApi = {
    async getUsers(params?: UserLookupParams): Promise<UserLookupItem[]> {
        // Use scoped lookup endpoint - works for all authenticated users
        return apiClient.get('/users/lookup', { params, schema: userLookupArraySchema });
    },

    async getDepartments(): Promise<DepartmentSummary[]> {
        return apiClient.get('/departments', { schema: departmentSummaryArraySchema });
    },

    async getRiskFilters(): Promise<{ processes: string[], categories: string[] }> {
        return apiClient.get('/lookups/risk-filters', { schema: riskFiltersSchema });
    }
};
