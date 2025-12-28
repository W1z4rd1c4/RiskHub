import { apiClient } from './apiClient';

export interface DepartmentSummary {
    id: number;
    name: string;
    code: string;
    user_count: number;
    risk_count: number;
    control_count: number;
    kri_count: number;
    high_risk_count: number;
}

export interface RiskDistribution {
    low: number;
    medium: number;
    high: number;
    critical: number;
}

export interface ControlStats {
    total: number;
    active: number;
    inactive: number;
    by_form: Record<string, number>;
    by_frequency: Record<string, number>;
}

export interface RecentExecution {
    id: number;
    control_id: number;
    control_name: string;
    result: string;
    executed_at: string;
    executed_by: string;
}

export interface DepartmentDetail {
    id: number;
    name: string;
    code: string;
    description?: string;
    created_at: string;
    updated_at: string;
    user_count: number;
    risk_count: number;
    control_count: number;
    kri_count: number;
    risk_distribution: RiskDistribution;
    risk_by_status: Record<string, number>;
    control_stats: ControlStats;
    recent_executions: RecentExecution[];
}

export const departmentApi = {
    /**
     * Get list of all departments with summary statistics
     */
    getDepartments: async (): Promise<DepartmentSummary[]> => {
        return apiClient.get<DepartmentSummary[]>('/departments');
    },

    /**
     * Get detailed department information
     */
    getDepartment: async (id: number): Promise<DepartmentDetail> => {
        return apiClient.get<DepartmentDetail>(`/departments/${id}`);
    },

    /**
     * Get risks for a specific department
     */
    getDepartmentRisks: async (
        id: number,
        params?: {
            skip?: number;
            limit?: number;
            status?: string;
        }
    ) => {
        return apiClient.get<any>(`/departments/${id}/risks`, { params });
    },

    /**
     * Get controls for a specific department
     */
    getDepartmentControls: async (
        id: number,
        params?: {
            skip?: number;
            limit?: number;
            status?: string;
        }
    ) => {
        return apiClient.get<any>(`/departments/${id}/controls`, { params });
    },

    /**
     * Get KRIs for a specific department
     */
    getDepartmentKRIs: async (
        id: number,
        params?: {
            skip?: number;
            limit?: number;
        }
    ) => {
        return apiClient.get<any>(`/departments/${id}/kris`, { params });
    },
};
