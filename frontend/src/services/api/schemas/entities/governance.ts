import type {
    Control,
    ControlListResponse,
    ControlMonitoringFields,
    ControlRiskLink,
    ControlSummary,
} from '@/types/control';
import type {
    Issue,
    IssueDepartmentLookup,
    IssueException,
    IssueLink,
    IssueListResponse,
    IssueOwnerLookup,
    IssueRemediationPlan,
    IssueRiskContext,
    IssueSummary,
    IssueVendorContext,
} from '@/types/issue';
import type {
    DueSoonKRI,
    KeyRiskIndicator,
    KRIHistoryEntry,
    KRIHistoryListResponse,
    KRIListResponse,
    KRIMonitoringFields,
    OverdueKRI,
} from '@/types/kri';
import type { Risk, RiskControlLink, RiskListResponse, RiskSummary } from '@/types/risk';
import type { Vendor, VendorLinkedRiskSummary, VendorListResponse } from '@/types/vendor';
import type { LinkedControl, LinkedKRI, LinkedRisk, LinkedVendorSummary } from '@/types/vendorLink';

import {
    collectionPaginationSchema,
    idNameCodeSchema,
    idNameEmailSchema,
    passthroughObject,
    z,
} from '../common';

export const linkedVendorSummarySchema: z.ZodType<LinkedVendorSummary> = passthroughObject({
    id: z.number(),
    name: z.string(),
});
export const linkedVendorSummaryArraySchema = z.array(linkedVendorSummarySchema);

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
});
export const linkedControlArraySchema = z.array(linkedControlSchema);

export const kriMonitoringFieldsSchema = passthroughObject({
    monitoring_status: z.enum(['new', 'not_submitted', 'breach', 'warning', 'optimal']).optional(),
    monitoring_status_reason: z
        .enum([
            'no_submission_history_within_window',
            'required_period_missing_submission',
            'latest_measurement_breach',
            'latest_measurement_warning_upper_margin',
            'latest_measurement_optimal',
        ])
        .optional(),
    is_submitted_for_required_period: z.boolean().optional(),
    required_period_end: z.string().optional(),
    required_due_date: z.string().optional(),
    days_overdue: z.number().optional(),
    warning_upper_margin_ratio: z.number().optional(),
}) satisfies z.ZodType<KRIMonitoringFields>;

export const linkedKRISchema: z.ZodType<LinkedKRI> = kriMonitoringFieldsSchema.extend({
    id: z.number(),
    risk_id: z.number(),
    metric_name: z.string(),
    description: z.string(),
    current_value: z.number(),
    lower_limit: z.number(),
    upper_limit: z.number(),
    unit: z.string(),
    frequency: z.string(),
    risk_name: z.string().nullable().optional(),
    risk_process: z.string().nullable().optional(),
    risk_department_name: z.string().nullable().optional(),
    is_archived: z.boolean().optional(),
});
export const linkedKRIArraySchema = z.array(linkedKRISchema);

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
    status: z.enum(['draft', 'active', 'inactive', 'archived']),
    created_by_id: z.number().nullable().optional(),
    updated_by_id: z.number().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    control_owner: idNameEmailSchema.nullable().optional(),
    department: idNameCodeSchema.nullable().optional(),
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
    status: z.enum(['draft', 'active', 'inactive', 'archived']),
    control_form: z.enum(['manual', 'automatic']),
    control_owner_name: z.string().nullable().optional(),
    risk_type: z.string().nullable().optional(),
    risk_id_code: z.string().nullable().optional(),
    risk_name: z.string().nullable().optional(),
    risk_description: z.string().nullable().optional(),
    risk_owner_name: z.string().nullable().optional(),
    risk_department_name: z.string().nullable().optional(),
    linked_vendors: linkedVendorSummaryArraySchema.optional(),
});
export const controlListResponseSchema: z.ZodType<ControlListResponse> =
    collectionPaginationSchema(controlSummarySchema);

export const keyRiskIndicatorSchema: z.ZodType<KeyRiskIndicator> = kriMonitoringFieldsSchema.extend({
    id: z.number(),
    risk_id: z.number(),
    is_archived: z.boolean().optional(),
    archived_at: z.string().nullable().optional(),
    archived_by_id: z.number().nullable().optional(),
    metric_name: z.string(),
    description: z.string(),
    current_value: z.number(),
    lower_limit: z.number(),
    upper_limit: z.number(),
    unit: z.string(),
    breach_status: z.enum(['above', 'below', 'within']),
    last_updated: z.string(),
    created_at: z.string(),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually']),
    reporting_owner_id: z.number().nullable().optional(),
    reporting_owner_name: z.string().nullable().optional(),
    last_period_end: z.string().nullable().optional(),
    last_reported_at: z.string().nullable().optional(),
    risk_category: z.string().nullable().optional(),
    risk_process: z.string().nullable().optional(),
    risk_name: z.string().nullable().optional(),
    risk_description: z.string().nullable().optional(),
    risk_type: z.string().nullable().optional(),
    risk_id_code: z.string().nullable().optional(),
    risk_owner_name: z.string().nullable().optional(),
    risk_department_name: z.string().nullable().optional(),
    department_name: z.string().nullable().optional(),
    linked_vendors: linkedVendorSummaryArraySchema.optional(),
});
export const keyRiskIndicatorArraySchema = z.array(keyRiskIndicatorSchema);
export const kriListResponseSchema: z.ZodType<KRIListResponse> =
    collectionPaginationSchema(keyRiskIndicatorSchema);

export const kriHistoryEntrySchema: z.ZodType<KRIHistoryEntry> = passthroughObject({
    id: z.number(),
    kri_id: z.number(),
    period_start: z.string(),
    period_end: z.string(),
    recorded_at: z.string(),
    value: z.number(),
    lower_limit: z.number(),
    upper_limit: z.number(),
    unit: z.string(),
    breach_status: z.string(),
    recorded_by_id: z.number().nullable().optional(),
    recorded_by_name: z.string().nullable().optional(),
});
export const kriHistoryListResponseSchema: z.ZodType<KRIHistoryListResponse> =
    z.union([
        passthroughObject({
            items: z.array(kriHistoryEntrySchema),
            total: z.number(),
            offset: z.number(),
            limit: z.number(),
        }),
        passthroughObject({
            items: z.array(kriHistoryEntrySchema),
            total: z.number(),
            page: z.number(),
            size: z.number(),
        }),
    ]).transform((response) => {
        if ('offset' in response) {
            return response;
        }
        return {
            ...response,
            offset: (response.page - 1) * response.size,
            limit: response.size,
        };
    });
export const overdueKRISchema: z.ZodType<OverdueKRI> = passthroughObject({
    kri_id: z.number(),
    metric_name: z.string(),
    frequency: z.string(),
    period_end: z.string(),
    due_date: z.string(),
    days_overdue: z.number(),
    reporting_owner_id: z.number().nullable().optional(),
    reporting_owner_name: z.string().nullable().optional(),
    risk_id: z.number(),
});
export const overdueKRIArraySchema = z.array(overdueKRISchema);
export const dueSoonKRISchema: z.ZodType<DueSoonKRI> = passthroughObject({
    kri_id: z.number(),
    metric_name: z.string(),
    frequency: z.string(),
    period_end: z.string(),
    due_date: z.string(),
    days_until_due: z.number(),
    reporting_owner_id: z.number().nullable().optional(),
    reporting_owner_name: z.string().nullable().optional(),
    risk_id: z.number(),
});
export const dueSoonKRIArraySchema = z.array(dueSoonKRISchema);

export const riskSummarySchema: z.ZodType<RiskSummary> = passthroughObject({
    id: z.number(),
    risk_id_code: z.string(),
    name: z.string(),
    process: z.string(),
    risk_type: z.string(),
    category: z.string().nullable().optional(),
    description: z.string(),
    gross_score: z.number(),
    gross_probability: z.number(),
    gross_impact: z.number(),
    net_score: z.number(),
    status: z.enum(['active', 'emerging', 'archived']),
    is_priority: z.boolean(),
    department_id: z.number().nullable().optional(),
    department_name: z.string().nullable().optional(),
    owner_id: z.number().optional(),
    kri_count: z.number().optional(),
    has_breach: z.boolean().optional(),
    control_count: z.number().optional(),
    linked_vendors: linkedVendorSummaryArraySchema.optional(),
});
export const riskListResponseSchema: z.ZodType<RiskListResponse> =
    collectionPaginationSchema(riskSummarySchema);

export const riskSchema: z.ZodType<Risk> = passthroughObject({
    id: z.number(),
    risk_id_code: z.string(),
    name: z.string(),
    process: z.string(),
    subprocess: z.string().nullable().optional(),
    risk_type: z.string(),
    category: z.string().nullable().optional(),
    description: z.string(),
    department_id: z.number().nullable().optional(),
    owner_id: z.number().nullable().optional(),
    gross_probability: z.number(),
    gross_impact: z.number(),
    gross_score: z.number(),
    net_probability: z.number(),
    net_impact: z.number(),
    net_score: z.number(),
    status: z.enum(['active', 'emerging', 'archived']),
    is_priority: z.boolean(),
    kri_indicator: z.string().optional(),
    kri_threshold_green: z.string().optional(),
    kri_threshold_yellow: z.string().optional(),
    kri_threshold_red: z.string().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    kris: keyRiskIndicatorArraySchema.optional(),
    owner: idNameEmailSchema.nullable().optional(),
    department: idNameCodeSchema.nullable().optional(),
});

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
        })
        .optional(),
    risk: passthroughObject({
        id: z.number(),
        name: z.string(),
        risk_id_code: z.string(),
        process: z.string(),
        description: z.string(),
        status: z.string().optional(),
    }).optional(),
});
export const controlRiskLinkArraySchema = z.array(controlRiskLinkSchema);

export const riskControlLinkSchema: z.ZodType<RiskControlLink> = passthroughObject({
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
            frequency: z.string(),
            risk_level: z.number(),
            status: z.string(),
        })
        .optional(),
    risk: passthroughObject({
        id: z.number(),
        risk_id_code: z.string(),
        process: z.string(),
        gross_score: z.number(),
        net_score: z.number(),
    }).optional(),
});
export const riskControlLinkArraySchema = z.array(riskControlLinkSchema);

export const vendorLinkedRiskSummarySchema: z.ZodType<VendorLinkedRiskSummary> =
    passthroughObject({
        risk_id: z.number(),
        risk_id_code: z.string(),
        risk_name: z.string(),
    });

export const vendorSchema: z.ZodType<Vendor> = passthroughObject({
    id: z.number(),
    name: z.string(),
    legal_name: z.string().nullable().optional(),
    registration_id: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    process: z.string(),
    subprocess: z.string().nullable().optional(),
    department_id: z.number().nullable().optional(),
    department_name: z.string().nullable().optional(),
    outsourcing_owner_user_id: z.number(),
    outsourcing_owner_name: z.string().nullable().optional(),
    linked_risks: z.array(vendorLinkedRiskSummarySchema),
    vendor_type: z.enum(['ict', 'outsourcing', 'professional_services', 'partner', 'other']),
    risk_score_1_5: z.number(),
    supports_important_core_insurance_function: z.boolean(),
    dora_relevant: z.boolean(),
    is_significant_vendor: z.boolean(),
    materiality_assessed_max_impact_pct_own_funds: z.number().nullable().optional(),
    replaceability: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
    has_alternative_providers: z.boolean(),
    status: z.enum(['active', 'inactive']),
    created_at: z.string(),
    updated_at: z.string(),
});
export const vendorArraySchema = z.array(vendorSchema);
export const vendorListResponseSchema: z.ZodType<VendorListResponse> =
    collectionPaginationSchema(vendorSchema);

export const issueLinkSchema: z.ZodType<IssueLink> = passthroughObject({
    id: z.number(),
    issue_id: z.number(),
    risk_id: z.number().nullable(),
    control_id: z.number().nullable(),
    execution_id: z.number().nullable(),
    kri_id: z.number().nullable(),
    vendor_id: z.number().nullable().optional(),
    linked_entity_type: z.string().nullable(),
    linked_entity_name: z.string().nullable(),
    created_at: z.string(),
});
export const issueRiskContextSchema: z.ZodType<IssueRiskContext> = passthroughObject({
    risk_id: z.number(),
    risk_name: z.string(),
    risk_category: z.string().nullable(),
    risk_process: z.string().nullable(),
    risk_type: z.string().nullable(),
});
export const issueVendorContextSchema: z.ZodType<IssueVendorContext> = passthroughObject({
    vendor_id: z.number(),
    vendor_name: z.string(),
});
export const issueSummarySchema = passthroughObject({
    id: z.number(),
    title: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    status: z.enum(['open', 'triaged', 'in_progress', 'ready_for_validation', 'closed']),
    source_type: z.enum(['manual', 'control_execution', 'kri_breach', 'audit']),
    source_id: z.number().nullable(),
    department_id: z.number(),
    department_name: z.string().nullable(),
    owner_user_id: z.number().nullable(),
    owner_user_name: z.string().nullable(),
    opened_at: z.string(),
    due_at: z.string().nullable(),
    closed_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    risk_contexts: z.array(issueRiskContextSchema),
    vendor_contexts: z.array(issueVendorContextSchema),
}) satisfies z.ZodType<IssueSummary>;
export const issueListResponseSchema: z.ZodType<IssueListResponse> =
    collectionPaginationSchema(issueSummarySchema);
export const issueRemediationPlanSchema: z.ZodType<IssueRemediationPlan> = passthroughObject({
    id: z.number(),
    issue_id: z.number(),
    status: z.enum(['draft', 'active', 'blocked', 'completed']),
    progress_percent: z.number(),
    owner_user_id: z.number().nullable(),
    owner_user_name: z.string().nullable(),
    target_date: z.string().nullable(),
    blocker_reason: z.string().nullable(),
    completion_notes: z.string().nullable(),
    completed_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});
export const issueExceptionSchema: z.ZodType<IssueException> = passthroughObject({
    id: z.number(),
    issue_id: z.number(),
    status: z.enum(['requested', 'approved', 'revoked', 'expired']),
    reason: z.string(),
    requested_by_id: z.number().nullable(),
    requested_by_name: z.string().nullable(),
    approved_by_id: z.number().nullable(),
    approved_by_name: z.string().nullable(),
    requested_at: z.string().nullable(),
    approved_at: z.string().nullable(),
    expires_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});
export const issueSchema: z.ZodType<Issue> = issueSummarySchema.extend({
    description: z.string().nullable(),
    created_by_id: z.number().nullable(),
    created_by_name: z.string().nullable(),
    validation_note: z.string().nullable(),
    links: z.array(issueLinkSchema),
    remediation_plan: issueRemediationPlanSchema.nullable(),
    exceptions: z.array(issueExceptionSchema),
});
export const issueDepartmentLookupSchema: z.ZodType<IssueDepartmentLookup> = idNameCodeSchema;
export const issueDepartmentLookupArraySchema = z.array(issueDepartmentLookupSchema);
export const issueOwnerLookupSchema: z.ZodType<IssueOwnerLookup> = passthroughObject({
    id: z.number(),
    name: z.string(),
    role_name: z.string().nullable(),
    department_name: z.string().nullable(),
});
export const issueOwnerLookupArraySchema = z.array(issueOwnerLookupSchema);
