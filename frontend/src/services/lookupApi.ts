import { apiClient } from './apiClient';
import {
    departmentSummaryArraySchema,
    processDepartmentReadSchema,
    riskFiltersSchema,
    threatStewardLookupArraySchema,
    userLookupArraySchema,
    z,
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

export type VendorOwnerLookupParams = Pick<AssignmentOwnerLookupParams, 'limit' | 'q'>;

export interface ThreatStewardLookupItem {
    id: number;
    name: string;
    email: string;
}

export interface ThreatStewardLookupParams extends Record<string, QueryValue> {
    limit?: number;
    q?: string;
}

export interface ProcessDepartmentLookupItem {
    id: number;
    name: string;
    code: string;
}

export interface ProcessOwnershipLookupParams extends Record<string, QueryValue> {
    limit?: number;
    q?: string;
}

export type AssetOwnershipLookupParams = ProcessOwnershipLookupParams;
export type AssetDepartmentLookupItem = ProcessDepartmentLookupItem;
export type VendorDepartmentLookupItem = ProcessDepartmentLookupItem;
export type VendorDepartmentLookupParams = ProcessOwnershipLookupParams;

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

    async getVendorOwners(params?: VendorOwnerLookupParams): Promise<UserLookupItem[]> {
        return apiClient.get('/users/lookup/vendor-owners', { params, schema: userLookupArraySchema });
    },

    async getVendorDepartments(params?: VendorDepartmentLookupParams): Promise<VendorDepartmentLookupItem[]> {
        return apiClient.get('/departments/lookup/vendor-owners', {
            params,
            schema: z.array(processDepartmentReadSchema.extend({ id: z.number() })),
        });
    },

    async getThreatStewards(params?: ThreatStewardLookupParams): Promise<ThreatStewardLookupItem[]> {
        return apiClient.get('/users/lookup/threat-stewards', {
            params,
            schema: threatStewardLookupArraySchema,
        });
    },

    async getProcessOwners(params?: ProcessOwnershipLookupParams): Promise<UserLookupItem[]> {
        return apiClient.get('/users/lookup/process-owners', {
            params,
            schema: userLookupArraySchema,
        });
    },

    async getProcessDepartments(params?: ProcessOwnershipLookupParams): Promise<ProcessDepartmentLookupItem[]> {
        return apiClient.get('/departments/lookup/process-owners', {
            params,
            schema: z.array(processDepartmentReadSchema.extend({ id: z.number() })),
        });
    },

    async getAssetOwners(params?: AssetOwnershipLookupParams): Promise<UserLookupItem[]> {
        return apiClient.get('/users/lookup/asset-owners', {
            params,
            schema: userLookupArraySchema,
        });
    },

    async getAssetDepartments(params?: AssetOwnershipLookupParams): Promise<AssetDepartmentLookupItem[]> {
        return apiClient.get('/departments/lookup/asset-owners', {
            params,
            schema: z.array(processDepartmentReadSchema.extend({ id: z.number() })),
        });
    },

    async getDepartments(): Promise<DepartmentSummary[]> {
        return apiClient.get('/departments', { schema: departmentSummaryArraySchema });
    },

    async getRiskFilters(): Promise<{ processes: string[], categories: string[] }> {
        return apiClient.get('/lookups/risk-filters', { schema: riskFiltersSchema });
    }
};
