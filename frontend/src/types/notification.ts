/**
 * Notification types for in-app notifications.
 */

export type NotificationType =
    | 'approval_pending'
    | 'approval_resolved'
    | 'approval_cancelled'
    | 'kri_due_soon'
    | 'kri_due_tomorrow'
    | 'kri_overdue'
    | 'kri_near_breach'
    | 'kri_breach_detected'
    | 'questionnaire_sent'
    | 'questionnaire_due_soon'
    | 'questionnaire_overdue'
    | 'questionnaire_submitted'
    | 'questionnaire_clarification_requested'
    | 'vendor_assessment_submitted'
    | 'vendor_assessment_committee_recommended'
    | 'vendor_assessment_decided'
    | 'vendor_reassessment_due_soon'
    | 'vendor_reassessment_overdue'
    | 'vendor_sla_due_soon'
    | 'vendor_sla_due_tomorrow'
    | 'vendor_sla_overdue'
    | 'vendor_sla_near_breach'
    | 'vendor_sla_breach_detected';

export interface Notification {
    id: number;
    type: NotificationType;
    title: string;
    message: string;
    resource_type?: string;
    resource_id?: number;
    is_read: boolean;
    created_at: string;
    expires_at?: string;
}

export interface NotificationListResponse {
    items: Notification[];
    total: number;
    skip: number;
    limit: number;
    unread_count: number;
}

export interface NotificationQueryParams {
    skip?: number;
    limit?: number;
    unread_only?: boolean;
}

export interface NotificationPreferences {
    approval_pending: boolean;
    approval_resolved: boolean;
    approval_cancelled: boolean;
    kri_due_soon: boolean;
    kri_due_tomorrow: boolean;
    kri_overdue: boolean;
    kri_near_breach: boolean;
    kri_breach_detected: boolean;
    questionnaire_sent: boolean;
    questionnaire_due_soon: boolean;
    questionnaire_overdue: boolean;
    questionnaire_submitted: boolean;
    questionnaire_clarification_requested: boolean;
    vendor_assessment_submitted: boolean;
    vendor_assessment_committee_recommended: boolean;
    vendor_assessment_decided: boolean;
    vendor_reassessment_due_soon: boolean;
    vendor_reassessment_overdue: boolean;
    vendor_sla_due_soon: boolean;
    vendor_sla_due_tomorrow: boolean;
    vendor_sla_overdue: boolean;
    vendor_sla_near_breach: boolean;
    vendor_sla_breach_detected: boolean;
}

export type NotificationPreferencesUpdate = Partial<NotificationPreferences>;
