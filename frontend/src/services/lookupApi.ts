import { apiClient } from './apiClient';
import {
    departmentSummaryArraySchema,
    riskFiltersSchema,
    threatStewardLookupArraySchema,
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
    role_name?: string;
    skip?: number;
}

export interface AssignmentOwnerLookupParams extends Record<string, QueryValue> {
    department_id?: number;
    limit?: number;
    q?: string;
}

export interface ThreatStewardLookupItem {
    id: number;
    name: string;
    email: string;
}

export interface ThreatStewardLookupParams extends Record<string, QueryValue> {
    limit?: number;
    q?: string;
}

export const lookupApi = {
    async getUsers(params?: UserLookupParams): Promise<UserLookupItem[]> {
        // Generic user lookup is restricted to callers with users:read.
        return apiClient.get('/users/lookup', { params, schema: userLookupArraySchema });
    },

    async getRiskOwners(params?: AssignmentOwnerLookupParams): Promise<UserLookupItem[]> {
        return apiClient.get('/users/lookup/risk-owners', { params, schema: userLookupArraySchema });
    },

    async getControlOwners(params?: AssignmentOwnerLookupParams): Promise<UserLookupItem[]> {
        return apiClient.get('/users/lookup/control-owners', { params, schema: userLookupArraySchema });
    },

    async getVendorOwners(params?: AssignmentOwnerLookupParams): Promise<UserLookupItem[]> {
        return apiClient.get('/users/lookup/vendor-owners', { params, schema: userLookupArraySchema });
    },

    async getThreatStewards(params?: ThreatStewardLookupParams): Promise<ThreatStewardLookupItem[]> {
        return apiClient.get('/users/lookup/threat-stewards', {
            params,
            schema: threatStewardLookupArraySchema,
        });
    },

    async getDepartments(): Promise<DepartmentSummary[]> {
        return apiClient.get('/departments', { schema: departmentSummaryArraySchema });
    },

    async getRiskFilters(): Promise<{ processes: string[], categories: string[] }> {
        return apiClient.get('/lookups/risk-filters', { schema: riskFiltersSchema });
    }
};
