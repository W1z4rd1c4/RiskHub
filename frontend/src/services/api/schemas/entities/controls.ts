import type {
    Control,
    ControlListResponse,
    ControlMonitoringFields,
    ControlRiskLink,
    ControlSummary,
} from '@/types/control';
import type { LinkedControl, LinkedRisk } from '@/types/vendorLink';

import { collectionPaginationSchema, idNameCodeSchema, idNameEmailSchema, passthroughObject, z } from '../common';
import { linkedVendorSummaryArraySchema } from './vendors';

export const controlMonitoringFieldsSchema = passthroughObject({
    monitoring_status: z.enum(['new', 'needs_review', 'failed', 'passed']).optional(),
    monitoring_status_reason: z
        .enum([
            'no_execution_logs_recent',
            'no_execution_logs_stale',
            'latest_execution_stale',
            'latest_execution_non_passed',
            'latest_execution_passed',
        ])
        .optional(),
    latest_execution_result: z
        .enum(['passed', 'failed', 'warning', 'not_applicable'])
        .nullable()
        .optional(),
    latest_executed_at: z.string().nullable().optional(),
    days_since_last_execution: z.number().nullable().optional(),
    execution_log_count: z.number().optional(),
}) satisfies z.ZodType<ControlMonitoringFields>;

const controlCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
    can_update_sensitive_fields: z.boolean(),
    can_request_update_approval: z.boolean(),
    can_archive_immediately: z.boolean(),
    can_request_archive_approval: z.boolean(),
    can_restore: z.boolean(),
    can_log_execution: z.boolean(),
    can_view_executions: z.boolean(),
    can_link_risk: z.boolean(),
    can_unlink_risk: z.boolean(),
    can_view_linked_risks: z.boolean(),
    can_view_linked_vendors: z.boolean(),
    can_create_issue: z.boolean(),
    has_pending_delete_approval: z.boolean(),
    has_pending_update_approval: z.boolean(),
    requires_privileged_update_approval: z.boolean(),
    requires_privileged_delete_approval: z.boolean(),
    is_archived: z.boolean(),
    is_executable: z.boolean(),
});

export const linkedRiskSchema: z.ZodType<LinkedRisk> = passthroughObject({
    id: z.number(),
    risk_id_code: z.string(),
    name: z.string(),
    process: z.string(),
    risk_type: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    gross_score: z.number().nullable().optional(),
    net_score: z.number().nullable().optional(),
    is_priority: z.boolean(),
    department_id: z.number().nullable().optional(),
    department_name: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    is_archived: z.boolean().optional(),
});
export const linkedRiskArraySchema = z.array(linkedRiskSchema);

export const linkedControlSchema: z.ZodType<LinkedControl> = controlMonitoringFieldsSchema.extend({
    id: z.number(),
    name: z.string(),
    frequency: z.string(),
    risk_level: z.number(),
    department_id: z.number().nullable().optional(),
    department_name: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    is_archived: z.boolean().optional(),
});
export const linkedControlArraySchema = z.array(linkedControlSchema);

export const controlSchema: z.ZodType<Control> = controlMonitoringFieldsSchema.extend({
    id: z.number(),
    name: z.string(),
    description: z.string(),
    data_source: z.string().nullable().optional(),
    methodology_reference: z.string().nullable().optional(),
    control_form: z.enum(['manual', 'automatic']),
    process_owner_position: z.string().nullable().optional(),
    control_owner_id: z.number().nullable().optional(),
    executor_position: z.string().nullable().optional(),
    frequency: z.enum([
        'daily',
        'weekly',
        'monthly',
        'quarterly',
        'semi-annually',
        'annually',
        'ad_hoc',
        'continuous',
    ]),
    risk_level: z.number(),
    output_description: z.string().nullable().optional(),
    report_recipient: z.string().nullable().optional(),
    documentation_location: z.string().nullable().optional(),
    department_id: z.number().nullable().optional(),
    status: z.enum(['draft', 'active', 'inactive']),
    is_archived: z.boolean(),
    created_by_id: z.number().nullable().optional(),
    updated_by_id: z.number().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    control_owner: idNameEmailSchema.nullable().optional(),
    department: idNameCodeSchema.nullable().optional(),
    capabilities: controlCapabilitiesSchema.nullable().optional(),
});

export const controlSummarySchema: z.ZodType<ControlSummary> = controlMonitoringFieldsSchema.extend({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable().optional(),
    department_id: z.number().nullable().optional(),
    department_name: z.string().nullable().optional(),
    frequency: z.enum([
        'daily',
        'weekly',
        'monthly',
        'quarterly',
        'semi-annually',
        'annually',
        'ad_hoc',
        'continuous',
    ]),
    risk_level: z.number(),
    status: z.enum(['draft', 'active', 'inactive']),
    is_archived: z.boolean(),
    control_form: z.enum(['manual', 'automatic']),
    control_owner_name: z.string().nullable().optional(),
    risk_type: z.string().nullable().optional(),
    risk_id_code: z.string().nullable().optional(),
    risk_name: z.string().nullable().optional(),
    risk_description: z.string().nullable().optional(),
    risk_owner_name: z.string().nullable().optional(),
    risk_department_name: z.string().nullable().optional(),
    linked_vendors: linkedVendorSummaryArraySchema.optional(),
    capabilities: controlCapabilitiesSchema.nullable().optional(),
});
export const controlListResponseSchema: z.ZodType<ControlListResponse> =
    collectionPaginationSchema(controlSummarySchema);

export const controlRiskLinkSchema: z.ZodType<ControlRiskLink> = passthroughObject({
    id: z.number(),
    control_id: z.number(),
    risk_id: z.number(),
    effectiveness: z.enum(['high', 'medium', 'low']),
    notes: z.string().nullable().optional(),
    created_at: z.string(),
    control: controlMonitoringFieldsSchema
        .extend({
            id: z.number(),
            name: z.string(),
            frequency: z.string().optional(),
            risk_level: z.number().optional(),
            status: z.string().optional(),
            is_archived: z.boolean(),
        })
        .optional(),
    risk: passthroughObject({
        id: z.number(),
        name: z.string(),
        risk_id_code: z.string(),
        process: z.string(),
        description: z.string(),
        status: z.string().optional(),
        is_archived: z.boolean(),
    }).optional(),
});
export const controlRiskLinkArraySchema = z.array(controlRiskLinkSchema);
