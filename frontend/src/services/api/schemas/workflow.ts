import type { ActivityLogEntry, ActivityLogListResponse } from '@/types/activityLog';
import type {
    ApprovalCreatedResponse,
    ApprovalListResponse,
    ApprovalRequest,
    PendingChange,
} from '@/types/approval';
import type {
    Notification,
    NotificationListResponse,
    NotificationPreferences,
} from '@/types/notification';
import type {
    OrphanedItem,
    OrphanedItemsOverview,
    OrphanStats,
} from '@/types/orphanedItem';
import type {
    RiskQuestionnaireClarification,
    RiskQuestionnaireDetail,
    RiskQuestionnaireListItem,
    RiskQuestionnairePreviousSubmission,
} from '@/types/riskQuestionnaire';

import {
    approvalIdMessageSchema,
    changeMapSchema,
    countSchema,
    numberArraySchema,
    offsetPaginationSchema,
    passthroughObject,
    stringArraySchema,
    unknownRecordSchema,
    unreadCountSchema,
    z,
} from './common';

const pendingChangeSchema: z.ZodType<PendingChange> = passthroughObject({
    old: z.unknown(),
    new: z.unknown(),
});

export const activityLogEntrySchema: z.ZodType<ActivityLogEntry> = passthroughObject({
    id: z.number(),
    entity_type: z.string(),
    entity_id: z.number(),
    entity_name: z.string(),
    action: z.string(),
    actor_id: z.number().nullable(),
    actor_name: z.string(),
    department_id: z.number().nullable(),
    changes: changeMapSchema.nullable(),
    description: z.string(),
    created_at: z.string(),
});
export const activityLogListResponseSchema: z.ZodType<ActivityLogListResponse> =
    offsetPaginationSchema(activityLogEntrySchema).extend({
        capabilities: passthroughObject({
            can_read: z.boolean(),
            can_filter_by_department: z.boolean(),
            can_view_entity_filters: z.boolean(),
            can_export_csv: z.boolean(),
        }).nullable().optional(),
    });

export const approvalRequestSchema: z.ZodType<ApprovalRequest> = passthroughObject({
    id: z.number(),
    resource_type: z.enum(['risk', 'control', 'kri']),
    resource_id: z.number(),
    resource_name: z.string(),
    action_type: z.enum(['delete', 'edit']),
    pending_changes: z.record(z.string(), pendingChangeSchema).nullable(),
    status: z.enum(['pending', 'pending_privileged', 'approved', 'rejected', 'cancelled']),
    reason: z.string(),
    requested_by_id: z.number(),
    requested_by_name: z.string().nullable(),
    requested_by_email: z.string().nullable(),
    resolved_by_id: z.number().nullable(),
    resolved_by_name: z.string().nullable(),
    resolved_at: z.string().nullable(),
    resolution_notes: z.string().nullable(),
    created_at: z.string(),
    can_approve: z.boolean(),
    can_reject: z.boolean(),
    capabilities: passthroughObject({
        can_read: z.boolean(),
        can_approve: z.boolean(),
        can_reject: z.boolean(),
        can_cancel: z.boolean(),
        can_cancel_as_requester: z.boolean(),
        can_cancel_as_resolver: z.boolean(),
        can_view_pending_changes: z.boolean(),
        can_view_resolution_notes: z.boolean(),
        can_inspect_side_effects: z.boolean(),
        is_requester: z.boolean(),
        is_primary_approver: z.boolean(),
        is_privileged_resolver: z.boolean(),
        is_pending: z.boolean(),
        requires_privileged_resolution: z.boolean(),
        would_apply_side_effects_on_approve: z.boolean(),
    }).nullable().optional(),
});
export const approvalListResponseSchema: z.ZodType<ApprovalListResponse> =
    offsetPaginationSchema(approvalRequestSchema);
export const approvalCreatedResponseSchema: z.ZodType<ApprovalCreatedResponse> =
    passthroughObject({
        status: z.literal('approval_required'),
        message: z.string(),
        approval_id: z.number(),
        action_type: z.enum(['delete', 'edit']),
        pending_fields: z.array(z.string()),
        pending_changes: unknownRecordSchema.nullable().optional(),
        primary_approver_id: z.number().nullable().optional(),
        requires_privileged_approval: z.boolean().optional(),
    });

export const notificationSchema: z.ZodType<Notification> = passthroughObject({
    id: z.number(),
    type: z.enum([
        'approval_pending',
        'approval_resolved',
        'approval_cancelled',
        'kri_due_soon',
        'kri_due_tomorrow',
        'kri_overdue',
        'kri_near_breach',
        'kri_breach_detected',
        'questionnaire_sent',
        'questionnaire_due_soon',
        'questionnaire_overdue',
        'questionnaire_submitted',
        'questionnaire_clarification_requested',
        'issue_assigned',
        'issue_due_soon',
        'issue_overdue',
        'issue_exception_requested',
        'issue_exception_approved',
    ]),
    title: z.string(),
    message: z.string(),
    resource_type: z.string().nullable().optional(),
    resource_id: z.number().nullable().optional(),
    is_read: z.boolean(),
    created_at: z.string(),
    expires_at: z.string().nullable().optional(),
});
export const notificationListResponseSchema: z.ZodType<NotificationListResponse> =
    passthroughObject({
        items: z.array(notificationSchema),
        total: z.number(),
        skip: z.number(),
        limit: z.number(),
        unread_count: z.number(),
    });
export const notificationPreferencesSchema: z.ZodType<NotificationPreferences> =
    passthroughObject({
        approval_pending: z.boolean(),
        approval_resolved: z.boolean(),
        approval_cancelled: z.boolean(),
        kri_due_soon: z.boolean(),
        kri_due_tomorrow: z.boolean(),
        kri_overdue: z.boolean(),
        kri_near_breach: z.boolean(),
        kri_breach_detected: z.boolean(),
        questionnaire_sent: z.boolean(),
        questionnaire_due_soon: z.boolean(),
        questionnaire_overdue: z.boolean(),
        questionnaire_submitted: z.boolean(),
        questionnaire_clarification_requested: z.boolean(),
    });

export const orphanedItemSchema: z.ZodType<OrphanedItem> = passthroughObject({
    id: z.number(),
    item_type: z.enum(['risk', 'control', 'kri']),
    item_id: z.number(),
    item_name: z.string(),
    item_description: z.string().nullable(),
    item_identifier: z.string(),
    department_name: z.string().nullable(),
    previous_owner_name: z.string(),
    previous_owner_email: z.string(),
    orphaned_at: z.string(),
    status: z.enum(['pending', 'resolved']),
    capabilities: passthroughObject({
        can_resolve: z.boolean(),
        can_view_detail: z.boolean(),
        requires_owner: z.boolean(),
        requires_risk: z.boolean(),
        requires_department: z.boolean(),
    }).nullable().optional(),
});
export const orphanedItemArraySchema = z.array(orphanedItemSchema);
export const orphanStatsSchema: z.ZodType<OrphanStats> = passthroughObject({
    risk_count: z.number(),
    control_count: z.number(),
    kri_count: z.number(),
    total_count: z.number(),
});
export const orphanedItemsOverviewSchema: z.ZodType<OrphanedItemsOverview> =
    passthroughObject({
        stats: orphanStatsSchema,
        items: orphanedItemArraySchema,
        last_scan_at: z.string().nullable(),
        scan_status: z.string().nullable(),
    });
export const orphanScanResponseSchema = passthroughObject({
    flagged: z.number(),
});
export const resolveOrphanResponseSchema = passthroughObject({
    status: z.string(),
    orphan_id: z.number(),
    new_owner_id: z.number().nullable().optional(),
});

export const riskQuestionnairePreviousSubmissionSchema: z.ZodType<RiskQuestionnairePreviousSubmission> =
    passthroughObject({
        id: z.number(),
        submitted_at: z.string(),
        template_version: z.string(),
        answers: unknownRecordSchema.nullable().optional(),
    });
export const riskQuestionnaireCapabilitiesSchema = passthroughObject({
    can_open: z.boolean(),
    can_save_draft: z.boolean(),
    can_submit: z.boolean(),
    can_request_clarification: z.boolean(),
    can_respond_to_clarifications: z.boolean(),
});
export const riskQuestionnaireListItemSchema = passthroughObject({
        id: z.number(),
        risk_id: z.number(),
        risk_name: z.string().nullable().optional(),
        assigned_to_user_id: z.number(),
        sent_by_user_id: z.number(),
        status: z.enum(['sent', 'in_progress', 'submitted']),
        template_key: z.string(),
        template_version: z.string(),
        sent_at: z.string(),
        due_at: z.string(),
        submitted_at: z.string().nullable().optional(),
        submitted_by_user_id: z.number().nullable().optional(),
        assigned_to_user_name: z.string().nullable().optional(),
        sent_by_user_name: z.string().nullable().optional(),
        submitted_by_user_name: z.string().nullable().optional(),
        capabilities: riskQuestionnaireCapabilitiesSchema.nullable().optional(),
    }) satisfies z.ZodType<RiskQuestionnaireListItem>;
export const riskQuestionnaireDetailSchema: z.ZodType<RiskQuestionnaireDetail> =
    riskQuestionnaireListItemSchema.extend({
        answers: unknownRecordSchema.nullable().optional(),
        previous_submission: riskQuestionnairePreviousSubmissionSchema.nullable().optional(),
    });
export const riskQuestionnaireListItemArraySchema = z.array(riskQuestionnaireListItemSchema);

export const riskQuestionnaireClarificationSchema: z.ZodType<RiskQuestionnaireClarification> =
    passthroughObject({
        id: z.number(),
        questionnaire_id: z.number(),
        section_key: z.string(),
        question_keys: stringArraySchema.nullable().optional(),
        request_message: z.string(),
        requested_by_user_id: z.number(),
        requested_by_user_name: z.string().nullable().optional(),
        requested_at: z.string(),
        response_message: z.string().nullable().optional(),
        responded_by_user_id: z.number().nullable().optional(),
        responded_by_user_name: z.string().nullable().optional(),
        responded_at: z.string().nullable().optional(),
    });
export const riskQuestionnaireClarificationArraySchema = z.array(
    riskQuestionnaireClarificationSchema,
);

export const pendingCountSchema = countSchema;
export const notificationCountSchema = countSchema;
export const notificationUnreadCountSchema = unreadCountSchema;
export const approvalMessageSchema = approvalIdMessageSchema;
export const batchSendResponseSchema = passthroughObject({
    created_count: z.number(),
    skipped_no_owner: numberArraySchema,
    skipped_open_exists: numberArraySchema,
    errors: stringArraySchema,
});
