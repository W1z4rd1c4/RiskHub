import type {
    ApprovalScenario,
    DepartmentHubRead,
    GlobalConfig,
    PermissionRead,
    PublicRiskType,
    RiskType,
    RoleHubRead,
} from '@/services/riskHubApi';

import {
    passthroughObject,
    statusIdAffectedRisksSchema,
    statusIdSchema,
    stringArraySchema,
    z,
} from './common';
import { batchSendResponseSchema } from './workflow';

export const riskTypeSchema: z.ZodType<RiskType> = passthroughObject({
    id: z.number(),
    code: z.string(),
    display_name: z.string(),
    description: z.string().nullable(),
    color: z.string(),
    icon: z.string().nullable(),
    sort_order: z.number(),
    is_active: z.boolean(),
    is_system: z.boolean(),
    risk_count: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
    capabilities: passthroughObject({
        can_create: z.boolean(),
        can_update: z.boolean(),
        can_delete: z.boolean(),
        can_restore: z.boolean(),
    }).nullable().optional(),
});
export const riskTypeArraySchema = z.array(riskTypeSchema);
export const publicRiskTypeSchema: z.ZodType<PublicRiskType> = passthroughObject({
    code: z.string(),
    display_name: z.string(),
    color: z.string(),
    icon: z.string().nullable(),
    sort_order: z.number(),
});
export const publicRiskTypeArraySchema = z.array(publicRiskTypeSchema);

export const globalConfigSchema: z.ZodType<GlobalConfig> = passthroughObject({
    id: z.number(),
    key: z.string(),
    value: z.string(),
    value_type: z.string(),
    category: z.string(),
    display_name: z.string(),
    description: z.string().nullable(),
    min_value: z.number().nullable(),
    max_value: z.number().nullable(),
    is_editable: z.boolean(),
    updated_at: z.string(),
    updated_by_name: z.string().nullable(),
});
export const globalConfigArraySchema = z.array(globalConfigSchema);
export const globalConfigRecordSchema = z.record(z.string(), globalConfigArraySchema);
export const publicConfigValueSchema = passthroughObject({
    key: z.string(),
    value: z.unknown(),
    value_type: z.string(),
});

export const approvalScenarioSchema: z.ZodType<ApprovalScenario> = passthroughObject({
    id: z.number(),
    key: z.string(),
    display_name: z.string(),
    description: z.string(),
    requires_approval: z.boolean(),
    approver_roles: stringArraySchema,
    updated_at: z.string(),
    updated_by_name: z.string().nullable(),
    capabilities: passthroughObject({
        can_update: z.boolean(),
    }).nullable().optional(),
});
export const approvalScenarioArraySchema = z.array(approvalScenarioSchema);

export const riskHubPermissionReadSchema: z.ZodType<PermissionRead> = passthroughObject({
    id: z.number(),
    resource: z.string(),
    action: z.string(),
    description: z.string().nullable(),
});
export const riskHubPermissionReadArraySchema = z.array(riskHubPermissionReadSchema);

const riskHubActionCapabilitiesSchema = passthroughObject({
    can_update: z.boolean(),
    can_delete: z.boolean(),
    can_restore: z.boolean(),
});

export const roleHubReadSchema: z.ZodType<RoleHubRead> = passthroughObject({
    id: z.number(),
    name: z.string(),
    display_name: z.string(),
    description: z.string().nullable(),
    is_system: z.boolean(),
    is_active: z.boolean(),
    user_count: z.number(),
    permissions: stringArraySchema,
    capabilities: riskHubActionCapabilitiesSchema.nullable().optional(),
});
export const roleHubReadArraySchema = z.array(roleHubReadSchema);

export const departmentHubReadSchema: z.ZodType<DepartmentHubRead> = passthroughObject({
    id: z.number(),
    name: z.string(),
    code: z.string().nullable(),
    manager_id: z.number().nullable(),
    manager_name: z.string().nullable(),
    is_active: z.boolean(),
    user_count: z.number(),
    risk_count: z.number(),
    control_count: z.number(),
    capabilities: riskHubActionCapabilitiesSchema.nullable().optional(),
});
export const departmentHubReadArraySchema = z.array(departmentHubReadSchema);

export const batchSendQuestionnairesResponseSchema = batchSendResponseSchema;
export const roleDeleteResponseSchema = statusIdSchema;
export const departmentDeleteResponseSchema = statusIdSchema;
export const riskTypeDeleteResponseSchema = statusIdAffectedRisksSchema;
