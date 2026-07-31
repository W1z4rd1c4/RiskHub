import { apiClient } from './apiClient';
import {
    controlSummarySchema,
    departmentDetailSchema,
    departmentSummaryArraySchema,
    kriListResponseSchema,
    riskSummarySchema,
    z,
} from '@/services/api/schemas';
import type { ControlSummary } from '@/types/control';
import type { KRIListResponse, KRIMonitoringStatus } from '@/types/kri';
import type { RiskSummary } from '@/types/risk';

export interface DepartmentSummary {
    id: number;
    name: string;
    code: string;
    user_count: number;
    risk_count: number;
    high_risk_count: number;
    control_count: number;
    kri_count: number;
    breaching_kri_count: number;
    total_net_score: number;
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
    description?: string | null;
    created_at: string;
    updated_at: string;
    user_count: number | null;
    risk_count: number | null;
    high_risk_count: number | null;
    control_count: number | null;
    kri_count: number | null;
    kri_monitoring_counts: Record<string, number> | null;
    risk_distribution: RiskDistribution | null;
    risk_by_status: Record<string, number> | null;
    control_stats: ControlStats | null;
    recent_executions: RecentExecution[] | null;
    issue_count?: number | null;
    process_count?: number | null;
    asset_count?: number | null;
    vendor_count?: number | null;
    overdue_issue_count?: number | null;
    process_accountability_gap_count?: number | null;
    asset_accountability_gap_count?: number | null;
    significant_vendor_count?: number | null;
}

export const departmentApi = {
    /**
     * Get list of all departments with summary statistics
     */
    getDepartments: async (): Promise<DepartmentSummary[]> => {
        return apiClient.get('/departments', { schema: departmentSummaryArraySchema });
    },

    /**
     * Get detailed department information
     */
    getDepartment: async (id: number): Promise<DepartmentDetail> => {
        return apiClient.get(`/departments/${id}`, { schema: departmentDetailSchema });
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
            min_net_score?: number;
        }
    ): Promise<RiskSummary[]> => {
        return apiClient.get(`/departments/${id}/risks`, {
            params,
            schema: z.array(riskSummarySchema),
        });
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
    ): Promise<ControlSummary[]> => {
        return apiClient.get(`/departments/${id}/controls`, {
            params,
            schema: z.array(controlSummarySchema),
        });
    },

    /**
     * Get KRIs for a specific department
     */
    getDepartmentKRIs: async (
        id: number,
        params?: {
            skip?: number;
            limit?: number;
            monitoring_status?: KRIMonitoringStatus;
        }
    ): Promise<KRIListResponse> => {
        return apiClient.get(`/departments/${id}/kris`, {
            params,
            schema: kriListResponseSchema,
        });
    },
};
