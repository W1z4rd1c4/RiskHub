import { apiClient } from './apiClient';

// ============================================================================
// Types
// ============================================================================

export interface RiskType {
    id: number;
    code: string;
    display_name: string;
    description: string | null;
    color: string;
    icon: string | null;
    sort_order: number;
    is_active: boolean;
    is_system: boolean;
    risk_count: number;
    created_at: string;
    updated_at: string;
}

export interface RiskTypeCreate {
    code: string;
    display_name: string;
    description?: string;
    color?: string;
    icon?: string;
    sort_order?: number;
}

export interface RiskTypeUpdate {
    display_name?: string;
    description?: string;
    color?: string;
    icon?: string;
    sort_order?: number;
}

export interface GlobalConfig {
    id: number;
    key: string;
    value: string;
    value_type: string;
    category: string;
    display_name: string;
    description: string | null;
    min_value: number | null;
    max_value: number | null;
    is_editable: boolean;
    updated_at: string;
    updated_by_name: string | null;
}

export interface ApprovalScenario {
    id: number;
    key: string;
    display_name: string;
    description: string;
    requires_approval: boolean;
    approver_roles: string[];
    updated_at: string;
    updated_by_name: string | null;
}

export interface ApprovalScenarioUpdate {
    requires_approval?: boolean;
    approver_roles?: string[];
}

export interface PermissionRead {
    id: number;
    resource: string;
    action: string;
    description: string | null;
}

export interface RoleHubRead {
    id: number;
    name: string;
    display_name: string;
    description: string | null;
    is_system: boolean;
    is_active: boolean;
    user_count: number;
    permissions: string[];
}

export interface RoleHubCreate {
    name: string;
    display_name: string;
    description?: string;
    permission_ids: number[];
}

export interface RoleHubUpdate {
    display_name?: string;
    description?: string;
    permission_ids?: number[];
}

export interface DepartmentHubRead {
    id: number;
    name: string;
    code: string | null;
    manager_id: number | null;
    manager_name: string | null;
    is_active: boolean;
    user_count: number;
    risk_count: number;
    control_count: number;
}

export interface DepartmentHubCreate {
    name: string;
    code?: string;
    manager_id?: number;
}

export interface DepartmentHubUpdate {
    name?: string;
    code?: string;
    manager_id?: number | null;
}

// Public Risk Type (minimal fields for non-CRO access)
export interface PublicRiskType {
    code: string;
    display_name: string;
    color: string;
    icon: string | null;
    sort_order: number;
}

// ============================================================================
// API Client
// ============================================================================

export const riskHubApi = {
    // Risk Types (CRO-only)
    getRiskTypes: (includeInactive = false) =>
        apiClient.get<RiskType[]>('/riskhub/risk-types', { params: { include_inactive: includeInactive } }),

    // Public Risk Types (all authenticated users)
    getPublicRiskTypes: () =>
        apiClient.get<PublicRiskType[]>('/riskhub/public-risk-types'),

    createRiskType: (data: RiskTypeCreate) =>
        apiClient.post<RiskType>('/riskhub/risk-types', data),

    updateRiskType: (id: number, data: RiskTypeUpdate) =>
        apiClient.patch<RiskType>(`/riskhub/risk-types/${id}`, data),

    deleteRiskType: (id: number) =>
        apiClient.delete<{ status: string; id: number; affected_risks: number }>(`/riskhub/risk-types/${id}`),

    restoreRiskType: (id: number) =>
        apiClient.post<RiskType>(`/riskhub/risk-types/${id}/restore`, {}),

    // Global Config
    getAllConfig: () =>
        apiClient.get<Record<string, GlobalConfig[]>>('/riskhub/config'),

    getConfigCategory: (category: string) =>
        apiClient.get<GlobalConfig[]>(`/riskhub/config/${category}`),

    updateConfig: (key: string, value: string) =>
        apiClient.patch<GlobalConfig>(`/riskhub/config/${key}`, { value }),

    // Public config read (for all authenticated users)
    getConfigValue: (key: string) =>
        apiClient.get<{ key: string; value: unknown; value_type: string }>(`/riskhub/public-config/${key}`),

    // Approval Scenarios
    getApprovalScenarios: () =>
        apiClient.get<ApprovalScenario[]>('/riskhub/approval-scenarios'),

    updateApprovalScenario: (key: string, data: ApprovalScenarioUpdate) =>
        apiClient.patch<ApprovalScenario>(`/riskhub/approval-scenarios/${key}`, data),

    // Roles
    getPermissions: () =>
        apiClient.get<PermissionRead[]>('/riskhub/permissions'),

    getRoles: (includeInactive = false) =>
        apiClient.get<RoleHubRead[]>('/riskhub/roles', { params: { include_inactive: includeInactive } }),

    createRole: (data: RoleHubCreate) =>
        apiClient.post<RoleHubRead>('/riskhub/roles', data),

    updateRole: (id: number, data: RoleHubUpdate) =>
        apiClient.patch<RoleHubRead>(`/riskhub/roles/${id}`, data),

    deleteRole: (id: number) =>
        apiClient.delete<{ status: string; id: number }>(`/riskhub/roles/${id}`),

    restoreRole: (id: number) =>
        apiClient.post<RoleHubRead>(`/riskhub/roles/${id}/restore`, {}),

    // Departments
    getDepartments: (includeInactive = false) =>
        apiClient.get<DepartmentHubRead[]>('/riskhub/departments', { params: { include_inactive: includeInactive } }),

    createDepartment: (data: DepartmentHubCreate) =>
        apiClient.post<DepartmentHubRead>('/riskhub/departments', data),

    updateDepartment: (id: number, data: DepartmentHubUpdate) =>
        apiClient.patch<DepartmentHubRead>(`/riskhub/departments/${id}`, data),

    deleteDepartment: (id: number) =>
        apiClient.delete<{ status: string; id: number }>(`/riskhub/departments/${id}`),

    restoreDepartment: (id: number) =>
        apiClient.post<DepartmentHubRead>(`/riskhub/departments/${id}/restore`, {}),
};
