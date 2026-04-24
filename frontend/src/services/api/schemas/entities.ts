import type {
    AccessUserRead,
    PermissionRead as AccessPermissionRead,
    RoleWithPermissions,
} from '@/types/access';
import type {
    Control,
    ControlListResponse,
    ControlMonitoringFields,
    ControlRiskLink,
    ControlSummary,
} from '@/types/control';
import type { DashboardOverview, DashboardSummary, DepartmentMetrics, IssueAgingResponse, IssueDashboardSummary, IssueSeverityBreakdownResponse, KRIBreachTrendPoint, RiskDistribution, RiskTrendPoint, ControlTrend } from '@/types/dashboard';
import type { DirectoryImportResponse, DirectoryUser } from '@/types/directory';
import type {
    ControlExecution,
    ExecutionActor,
    ExecutionAuditItem,
    ExecutionControlRef,
    ExecutionListResponse,
} from '@/types/execution';
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
import type { UserDirectoryEntry, UserDirectoryListResponse, UserDirectoryRoleFacet, UserLookup, UserRead, UserShellSummary, Role } from '@/types/user';
import type { Vendor, VendorLinkedRiskSummary, VendorListResponse } from '@/types/vendor';
import type { LinkedControl, LinkedKRI, LinkedRisk, LinkedVendorSummary } from '@/types/vendorLink';
import type {
    ControlStats,
    DepartmentDetail,
    DepartmentSummary,
    RecentExecution,
} from '@/services/departmentApi';
import type { UserPreferences } from '@/services/preferencesApi';
import type {
    DashboardCommitteeSummary,
    DashboardMetricChange,
    DashboardQuarterlyComparison,
    DashboardRiskByCellItem,
} from '@/services/dashboardApi';

import {
    approvalIdMessageSchema,
    approvalCreatedResponseSchema,
    collectionPaginationSchema,
    idNameCodeSchema,
    idNameEmailSchema,
    numberRecordSchema,
    offsetPaginationSchema,
    pageSizePaginationSchema,
    passthroughObject,
    stringArraySchema,
    z,
} from './common';

const roleSchema: z.ZodType<Role> = passthroughObject({
    id: z.number(),
    name: z.string(),
    display_name: z.string(),
    description: z.string().nullable(),
});

export const userReadSchema: z.ZodType<UserRead> = passthroughObject({
    id: z.number(),
    email: z.string(),
    name: z.string(),
    is_active: z.boolean(),
    role: roleSchema,
    entra_business_role: z.string().nullable().optional(),
    department_id: z.number().nullable(),
    manager_id: z.number().nullable(),
    manager_name: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});
export const userReadArraySchema = z.array(userReadSchema);

export const userLookupSchema: z.ZodType<UserLookup> = passthroughObject({
    id: z.number(),
    name: z.string(),
    email: z.string(),
    role_name: z.string().nullable().optional(),
    department_id: z.number().nullable().optional(),
    department_name: z.string().nullable().optional(),
    manager_id: z.number().nullable().optional(),
});
export const userLookupArraySchema = z.array(userLookupSchema);

export const userDirectoryEntrySchema: z.ZodType<UserDirectoryEntry> = passthroughObject({
    id: z.number(),
    name: z.string(),
    email: z.string(),
    role_name: z.string().nullable().optional(),
    role_display_name: z.string().nullable().optional(),
    department_id: z.number().nullable().optional(),
    department_name: z.string().nullable().optional(),
});
export const userDirectoryRoleFacetSchema: z.ZodType<UserDirectoryRoleFacet> = passthroughObject({
    name: z.string(),
    display_name: z.string(),
    count: z.number(),
});
export const userDirectoryListResponseSchema: z.ZodType<UserDirectoryListResponse> =
    passthroughObject({
        items: z.array(userDirectoryEntrySchema),
        available_roles: z.array(userDirectoryRoleFacetSchema),
        total: z.number(),
        skip: z.number(),
        limit: z.number(),
    });

export const userShellSummarySchema: z.ZodType<UserShellSummary> = passthroughObject({
    unread_notifications_count: z.number(),
    pending_approvals_count: z.number(),
    questionnaire_inbox_count: z.number(),
    orphan_total_count: z.number(),
    can_view_governance: z.boolean(),
    generated_at: z.string(),
});

const accessPermissionReadSchema: z.ZodType<AccessPermissionRead> = passthroughObject({
    resource: z.string(),
    action: z.string(),
    description: z.string().nullable(),
});
export const accessUserReadSchema: z.ZodType<AccessUserRead> = passthroughObject({
    id: z.number(),
    email: z.string(),
    name: z.string(),
    is_active: z.boolean(),
    role_id: z.number(),
    role: passthroughObject({
        id: z.number(),
        name: z.string(),
        display_name: z.string(),
        description: z.string().nullable(),
    }),
    department_id: z.number().nullable(),
    department_name: z.string().nullable(),
    manager_id: z.number().nullable(),
    manager_name: z.string().nullable(),
    access_scope: z.enum(['global', 'department', 'manager']),
    scope_label: z.string(),
    effective_permissions: stringArraySchema,
    external_id: z.string().nullable().optional(),
    job_title: z.string().nullable().optional(),
    entra_business_role: z.string().nullable().optional(),
    directory_last_checked_at: z.string().nullable().optional(),
    directory_last_seen_at: z.string().nullable().optional(),
    directory_sync_status: z.string().nullable().optional(),
    deprovisioned_at: z.string().nullable().optional(),
    deprovision_reason: z.string().nullable().optional(),
});
export const accessUserReadArraySchema = z.array(accessUserReadSchema);
export const roleWithPermissionsSchema: z.ZodType<RoleWithPermissions> = passthroughObject({
    id: z.number(),
    name: z.string(),
    display_name: z.string(),
    description: z.string().nullable(),
    permissions: z.array(accessPermissionReadSchema),
});
export const roleWithPermissionsArraySchema = z.array(roleWithPermissionsSchema);

export const directoryUserSchema: z.ZodType<DirectoryUser> = passthroughObject({
    external_id: z.string(),
    display_name: z.string(),
    email: z.string().nullable(),
    user_principal_name: z.string().nullable(),
    department: z.string().nullable(),
    job_title: z.string().nullable(),
    account_enabled: z.boolean(),
    source: z.enum(['graph', 'ad_emulator']),
});
export const directoryUserArraySchema = z.array(directoryUserSchema);
export const directoryImportResponseSchema: z.ZodType<DirectoryImportResponse> =
    passthroughObject({
        status: z.enum(['created', 'updated']),
        user_id: z.number(),
        email: z.string(),
        name: z.string(),
        external_id: z.string(),
        department_id: z.number().nullable(),
        department_name: z.string().nullable(),
        entra_business_role: z.string().nullable(),
        role_id: z.number(),
        role_name: z.string().nullable(),
        directory_sync_status: z.string().nullable(),
    });

export const linkedVendorSummarySchema: z.ZodType<LinkedVendorSummary> = passthroughObject({
    id: z.number(),
    name: z.string(),
});
export const linkedVendorSummaryArraySchema = z.array(linkedVendorSummarySchema);

export const executionActorSchema: z.ZodType<ExecutionActor> = passthroughObject({
    id: z.number(),
    name: z.string(),
    email: z.string().optional(),
});
export const executionControlRefSchema: z.ZodType<ExecutionControlRef> = passthroughObject({
    id: z.number(),
    name: z.string(),
});
export const controlExecutionSchema = passthroughObject({
    id: z.number(),
    control_id: z.number(),
    executed_by_id: z.number(),
    executed_at: z.string(),
    result: z.enum(['passed', 'failed', 'warning', 'not_applicable']),
    findings: z.string().nullable().optional(),
    evidence_reference: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    next_scheduled: z.string().nullable().optional(),
    created_at: z.string(),
    executed_by: executionActorSchema.nullable().optional(),
}) satisfies z.ZodType<ControlExecution>;
export const controlExecutionArraySchema = z.array(controlExecutionSchema);
export const executionAuditItemSchema: z.ZodType<ExecutionAuditItem> = controlExecutionSchema.extend({
    control: executionControlRefSchema.optional(),
    control_name: z.string().optional(),
    executed_by_name: z.string().optional(),
    control_owner_name: z.string().optional(),
    linked_risks: z.array(z.string()).optional(),
});
export const executionListResponseSchema: z.ZodType<ExecutionListResponse> =
    offsetPaginationSchema(executionAuditItemSchema);

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

export const departmentSummarySchema: z.ZodType<DepartmentSummary> = passthroughObject({
    id: z.number(),
    name: z.string(),
    code: z.string(),
    user_count: z.number(),
    risk_count: z.number(),
    control_count: z.number(),
    kri_count: z.number(),
    high_risk_count: z.number(),
    breaching_kri_count: z.number(),
    total_net_score: z.number(),
});
export const departmentSummaryArraySchema = z.array(departmentSummarySchema);
const riskDistributionBucketSchema: z.ZodType<RiskDistribution> = passthroughObject({
    distribution: z.array(
        passthroughObject({
            probability: z.number(),
            impact: z.number(),
            count: z.number(),
        }),
    ),
});
const controlStatsSchema: z.ZodType<ControlStats> = passthroughObject({
    total: z.number(),
    active: z.number(),
    inactive: z.number(),
    by_form: numberRecordSchema,
    by_frequency: numberRecordSchema,
});
const recentExecutionSchema: z.ZodType<RecentExecution> = passthroughObject({
    id: z.number(),
    control_id: z.number(),
    control_name: z.string(),
    result: z.string(),
    executed_at: z.string(),
    executed_by: z.string(),
});
export const departmentDetailSchema: z.ZodType<DepartmentDetail> = passthroughObject({
    id: z.number(),
    name: z.string(),
    code: z.string(),
    description: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    user_count: z.number(),
    risk_count: z.number(),
    control_count: z.number(),
    kri_count: z.number(),
    kri_monitoring_counts: numberRecordSchema,
    risk_distribution: passthroughObject({
        low: z.number(),
        medium: z.number(),
        high: z.number(),
        critical: z.number(),
    }),
    risk_by_status: numberRecordSchema,
    control_stats: controlStatsSchema,
    recent_executions: z.array(recentExecutionSchema),
});

export const dashboardSummarySchema: z.ZodType<DashboardSummary> = passthroughObject({
    total_controls: z.number(),
    controls_by_status: numberRecordSchema,
    controls_by_form: numberRecordSchema,
    controls_by_frequency: numberRecordSchema,
    total_risks: z.number(),
    risks_by_status: numberRecordSchema,
    critical_risks_count: z.number(),
    average_net_risk_score: z.number(),
    total_vendors: z.number().optional(),
    high_risk_vendors_count: z.number().optional(),
});
export const departmentMetricsSchema: z.ZodType<DepartmentMetrics> = passthroughObject({
    department_id: z.number(),
    department_name: z.string(),
    control_count: z.number(),
    risk_count: z.number(),
    high_risk_count: z.number(),
    audited_control_count: z.number(),
    breaching_kri_count: z.number(),
    total_kri_count: z.number(),
    compliance_rate: z.number(),
});
export const riskDistributionSchema: z.ZodType<RiskDistribution> = riskDistributionBucketSchema;
export const controlTrendSchema: z.ZodType<ControlTrend> = passthroughObject({
    period: z.string(),
    execution_count: z.number(),
});
export const riskTrendPointSchema: z.ZodType<RiskTrendPoint> = passthroughObject({
    period: z.string(),
    total_new: z.number(),
    critical_new: z.number(),
});
export const kriBreachTrendPointSchema: z.ZodType<KRIBreachTrendPoint> = passthroughObject({
    period: z.string(),
    total_entries: z.number(),
    breached_entries: z.number(),
});
export const issueDashboardSummarySchema: z.ZodType<IssueDashboardSummary> = passthroughObject({
    open_issues: z.number(),
    overdue_issues: z.number(),
    high_severity_open: z.number(),
    median_days_open: z.number(),
});
export const issueAgingResponseSchema: z.ZodType<IssueAgingResponse> = passthroughObject({
    buckets: z.array(
        passthroughObject({
            bucket: z.string(),
            count: z.number(),
        }),
    ),
});
export const issueSeverityBreakdownResponseSchema: z.ZodType<IssueSeverityBreakdownResponse> =
    passthroughObject({
        items: z.array(
            passthroughObject({
                severity: z.string(),
                count: z.number(),
            }),
        ),
    });
export const dashboardOverviewSchema: z.ZodType<DashboardOverview> = passthroughObject({
    summary: dashboardSummarySchema,
    department_metrics: z.array(departmentMetricsSchema),
    gross_distribution: riskDistributionSchema,
    net_distribution: riskDistributionSchema,
    control_trends: z.array(controlTrendSchema),
    risk_trends: z.array(riskTrendPointSchema),
    kri_breach_trends: z.array(kriBreachTrendPointSchema),
    issue_summary: issueDashboardSummarySchema.nullable(),
    issue_aging: issueAgingResponseSchema.nullable(),
    issue_severity: issueSeverityBreakdownResponseSchema.nullable(),
    generated_at: z.string(),
});

export const dashboardRiskByCellItemSchema: z.ZodType<DashboardRiskByCellItem> = passthroughObject({
    id: z.number(),
    risk_id_code: z.string(),
    name: z.string(),
    description: z.string(),
    net_score: z.number(),
    department_name: z.string(),
    owner_name: z.string().optional(),
});
export const dashboardRiskByCellItemArraySchema = z.array(dashboardRiskByCellItemSchema);

const dashboardMetricChangeSchema: z.ZodType<DashboardMetricChange> = passthroughObject({
    absolute: z.number(),
    percentage: z.number(),
    direction: z.enum(['up', 'down', 'same', 'unknown']),
    note: z.string().optional(),
});
export const dashboardQuarterlyComparisonSchema: z.ZodType<DashboardQuarterlyComparison> =
    passthroughObject({
        this_quarter: numberRecordSchema,
        last_quarter: numberRecordSchema,
        changes: z.record(z.string(), dashboardMetricChangeSchema),
        period: passthroughObject({
            this_start: z.string(),
            this_end: z.string(),
            last_start: z.string(),
            last_end: z.string(),
        }),
        snapshot_info: passthroughObject({
            current_quarter: z.string(),
            last_quarter: z.string(),
            last_quarter_snapshot_available: z.boolean(),
            current_quarter_snapshot_available: z.boolean().optional(),
            missing_snapshot_quarters: z.array(z.string()).optional(),
            snapshot_sources: passthroughObject({
                current: z.enum(['live', 'stored', 'missing']),
                compare: z.enum(['stored', 'missing']),
            }).optional(),
            missing_snapshot_metrics: passthroughObject({
                current: z.array(z.string()),
                compare: z.array(z.string()),
            }).optional(),
            period_metrics: z.array(z.string()),
            snapshot_metrics: z.array(z.string()),
        }).optional(),
    });

export const dashboardCommitteeSummarySchema: z.ZodType<DashboardCommitteeSummary> =
    passthroughObject({
        critical_risks: z.array(
            passthroughObject({
                id: z.number(),
                risk_id_code: z.string(),
                name: z.string(),
                process: z.string(),
                description: z.string(),
                net_score: z.number(),
                is_priority: z.boolean(),
                owner_name: z.string(),
                department_name: z.string(),
            }),
        ),
        recent_activity: z.array(
            passthroughObject({
                id: z.number(),
                action: z.string(),
                entity_type: z.string(),
                entity_name: z.string(),
                description: z.string(),
                created_at: z.string(),
            }),
        ),
        department_exposure: z.array(
            passthroughObject({
                id: z.number(),
                name: z.string(),
                total_exposure: z.number(),
                risk_count: z.number(),
            }),
        ),
        critical_vendors: z.array(
            passthroughObject({
                id: z.number(),
                name: z.string(),
                process: z.string(),
                subprocess: z.string().nullable().optional(),
                risk_score_1_5: z.number(),
                supports_important_core_insurance_function: z.boolean(),
                dora_relevant: z.boolean(),
                is_significant_vendor: z.boolean(),
                outsourcing_owner_name: z.string(),
                department_name: z.string(),
            }),
        ).optional().default([]),
    });

export const riskFiltersSchema = passthroughObject({
    processes: z.array(z.string()),
    categories: z.array(z.string()),
});

export const userPreferencesSchema: z.ZodType<UserPreferences> = passthroughObject({
    theme: z.enum(['light', 'dark', 'riskhub']),
    language: z.enum(['en', 'cs']),
});

export const issueOrApprovalSchema = issueSchema.or(approvalIdMessageSchema);
export const riskOrApprovalSchema = riskSchema.or(approvalCreatedResponseSchema);
export const controlOrApprovalSchema = controlSchema.or(approvalCreatedResponseSchema);
export const keyRiskIndicatorOrApprovalSchema = keyRiskIndicatorSchema.or(approvalCreatedResponseSchema);
