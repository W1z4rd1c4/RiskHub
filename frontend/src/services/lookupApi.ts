import { apiClient } from './apiClient';
import type { DepartmentSummary } from './departmentApi';

export interface UserLookupItem {
    id: number;
    name: string;
    email: string;
    role_name?: string;
    department_id?: number;
    department_name?: string;
    manager_id?: number;
}

export const lookupApi = {
    async getUsers(): Promise<UserLookupItem[]> {
        // Use scoped lookup endpoint - works for all authenticated users
        return apiClient.get<UserLookupItem[]>('/users/lookup');
    },

    async getDepartments(): Promise<DepartmentSummary[]> {
        return apiClient.get<DepartmentSummary[]>('/departments');
    },

    async getRiskFilters(): Promise<{ processes: string[], categories: string[] }> {
        return apiClient.get<{ processes: string[], categories: string[] }>('/lookups/risk-filters');
    }
};
