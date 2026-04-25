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

import { collectionPaginationSchema, idNameCodeSchema, passthroughObject, z } from '../common';

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
