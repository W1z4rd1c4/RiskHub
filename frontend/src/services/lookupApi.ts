import { apiClient } from './apiClient';

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async getDepartments(): Promise<any[]> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return apiClient.get<any[]>('/departments');
    },

    async getRiskFilters(): Promise<{ processes: string[], categories: string[] }> {
        return apiClient.get<{ processes: string[], categories: string[] }>('/lookups/risk-filters');
    }
};

