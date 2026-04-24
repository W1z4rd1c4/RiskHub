import { apiClient } from './apiClient';
import {
    approvalScenarioArraySchema,
    approvalScenarioSchema,
    departmentHubReadArraySchema,
    departmentHubReadSchema,
    departmentDeleteResponseSchema,
    globalConfigArraySchema,
    globalConfigRecordSchema,
    globalConfigSchema,
    publicConfigValueSchema,
    publicRiskTypeArraySchema,
    riskHubPermissionReadArraySchema,
    riskTypeArraySchema,
    riskTypeDeleteResponseSchema,
    riskTypeSchema,
    roleDeleteResponseSchema,
    roleHubReadArraySchema,
    roleHubReadSchema,
} from '@/services/api/schemas';

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
    capabilities?: RoleHubCapabilities | null;
}

export interface RoleHubCapabilities {
    can_update: boolean;
    can_delete: boolean;
    can_restore: boolean;
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
    capabilities?: DepartmentHubCapabilities | null;
}

export interface DepartmentHubCapabilities {
    can_update: boolean;
    can_delete: boolean;
    can_restore: boolean;
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
        apiClient.get('/riskhub/risk-types', {
            params: { include_inactive: includeInactive },
            schema: riskTypeArraySchema,
        }),

    // Public Risk Types (all authenticated users)
    getPublicRiskTypes: () =>
        apiClient.get('/riskhub/public-risk-types', { schema: publicRiskTypeArraySchema }),

    createRiskType: (data: RiskTypeCreate) =>
        apiClient.post('/riskhub/risk-types', data, { schema: riskTypeSchema }),

    updateRiskType: (id: number, data: RiskTypeUpdate) =>
        apiClient.patch(`/riskhub/risk-types/${id}`, data, { schema: riskTypeSchema }),

    deleteRiskType: (id: number) =>
        apiClient.delete(`/riskhub/risk-types/${id}`, { schema: riskTypeDeleteResponseSchema }),

    restoreRiskType: (id: number) =>
        apiClient.post(`/riskhub/risk-types/${id}/restore`, {}, { schema: riskTypeSchema }),

    // Global Config
    getAllConfig: () =>
        apiClient.get('/riskhub/config', { schema: globalConfigRecordSchema }),

    getConfigCategory: (category: string) =>
        apiClient.get(`/riskhub/config/${category}`, { schema: globalConfigArraySchema }),

    updateConfig: (key: string, value: string) =>
        apiClient.patch(`/riskhub/config/${key}`, { value }, { schema: globalConfigSchema }),

    // Public config read (for all authenticated users)
    getConfigValue: (key: string) =>
        apiClient.get(`/riskhub/public-config/${key}`, { schema: publicConfigValueSchema }),

    // Approval Scenarios
    getApprovalScenarios: () =>
        apiClient.get('/riskhub/approval-scenarios', { schema: approvalScenarioArraySchema }),

    updateApprovalScenario: (key: string, data: ApprovalScenarioUpdate) =>
        apiClient.patch(`/riskhub/approval-scenarios/${key}`, data, {
            schema: approvalScenarioSchema,
        }),

    // Roles
    getPermissions: () =>
        apiClient.get('/riskhub/permissions', { schema: riskHubPermissionReadArraySchema }),

    getRoles: (includeInactive = false) =>
        apiClient.get('/riskhub/roles', {
            params: { include_inactive: includeInactive },
            schema: roleHubReadArraySchema,
        }),

    createRole: (data: RoleHubCreate) =>
        apiClient.post('/riskhub/roles', data, { schema: roleHubReadSchema }),

    updateRole: (id: number, data: RoleHubUpdate) =>
        apiClient.patch(`/riskhub/roles/${id}`, data, { schema: roleHubReadSchema }),

    deleteRole: (id: number) =>
        apiClient.delete(`/riskhub/roles/${id}`, { schema: roleDeleteResponseSchema }),

    restoreRole: (id: number) =>
        apiClient.post(`/riskhub/roles/${id}/restore`, {}, { schema: roleHubReadSchema }),

    // Departments
    getDepartments: (includeInactive = false) =>
        apiClient.get('/riskhub/departments', {
            params: { include_inactive: includeInactive },
            schema: departmentHubReadArraySchema,
        }),

    createDepartment: (data: DepartmentHubCreate) =>
        apiClient.post('/riskhub/departments', data, { schema: departmentHubReadSchema }),

    updateDepartment: (id: number, data: DepartmentHubUpdate) =>
        apiClient.patch(`/riskhub/departments/${id}`, data, { schema: departmentHubReadSchema }),

    deleteDepartment: (id: number) =>
        apiClient.delete(`/riskhub/departments/${id}`, { schema: departmentDeleteResponseSchema }),

    restoreDepartment: (id: number) =>
        apiClient.post(`/riskhub/departments/${id}/restore`, {}, {
            schema: departmentHubReadSchema,
        }),
};
