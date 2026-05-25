import type { CollectionListResponse } from '@/types/collection';
import type { LinkedVendorSummary } from '@/types/vendorLink';

export type KRIBreachStatus = 'above' | 'below' | 'within';
export type KRIMonitoringStatus = 'new' | 'not_submitted' | 'breach' | 'warning' | 'optimal';
export type KRITimelinessStatus = 'due_soon';
export type KRIMonitoringReason =
    | 'no_submission_history_within_window'
    | 'required_period_missing_submission'
    | 'latest_measurement_breach'
    | 'latest_measurement_warning_upper_margin'
    | 'latest_measurement_optimal';

export const KRIFrequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'annually'] as const;
export type KRIFrequency = typeof KRIFrequencies[number];

export interface KRIMonitoringFields {
    monitoring_status?: KRIMonitoringStatus;
    monitoring_status_reason?: KRIMonitoringReason;
    is_submitted_for_required_period?: boolean;
    required_period_end?: string;
    required_due_date?: string;
    days_overdue?: number;
    warning_upper_margin_ratio?: number;
}

export interface KRICapabilities {
    can_read: boolean;
    can_update: boolean;
    can_update_sensitive_fields: boolean;
    can_request_update_approval: boolean;
    can_archive_immediately: boolean;
    can_request_archive_approval: boolean;
    can_restore: boolean;
    can_submit_value: boolean;
    can_submit_backdated_value: boolean;
    can_request_value_submission_approval: boolean;
    can_view_history: boolean;
    can_request_history_correction: boolean;
    can_apply_history_correction_immediately: boolean;
    can_link_vendors: boolean;
    can_unlink_vendors: boolean;
    can_view_linked_vendors: boolean;
    can_create_issue: boolean;
    has_pending_delete_approval: boolean;
    has_pending_update_approval: boolean;
    has_pending_value_submission_approval: boolean;
    has_pending_history_correction_approval: boolean;
    requires_privileged_update_approval: boolean;
    requires_privileged_delete_approval: boolean;
}

export interface KeyRiskIndicator extends KRIMonitoringFields {
    id: number;
    risk_id: number;
    is_archived?: boolean;
    archived_at?: string | null;
    archived_by_id?: number | null;
    metric_name: string;
    description: string;
    current_value: number;
    lower_limit: number;
    upper_limit: number;
    unit: string;
    breach_status: KRIBreachStatus;
    last_updated: string;
    created_at: string;
    // Historization fields
    frequency: KRIFrequency;
    reporting_owner_id?: number | null;
    reporting_owner_name?: string | null;
    last_period_end?: string | null;
    last_reported_at?: string | null;
    // Grouping metadata
    risk_category?: string | null;
    risk_process?: string | null;
    risk_name?: string | null;
    risk_description?: string | null;
    risk_type?: string | null;
    risk_id_code?: string | null;
    risk_owner_name?: string | null;
    risk_department_name?: string | null;
    department_name?: string | null;
    linked_vendors?: LinkedVendorSummary[];
    capabilities?: KRICapabilities | null;
}

export interface KRICreate {
    risk_id: number;
    metric_name: string;
    description: string;
    current_value: number;
    lower_limit: number;
    upper_limit: number;
    unit?: string;
    frequency?: KRIFrequency;
    reporting_owner_id?: number | null;
    linked_vendor_ids?: number[];
    ensure_parent_risk_vendor_ids?: number[];
}

export interface KRIUpdate {
    metric_name?: string;
    description?: string;
    current_value?: number;
    lower_limit?: number;
    upper_limit?: number;
    unit?: string;
    frequency?: KRIFrequency;
    reporting_owner_id?: number | null;
    linked_vendor_ids?: number[];
}

export interface KRIListCapabilities {
    can_export?: boolean;
    can_create?: boolean;
    can_view_vendor_contexts?: boolean;
}

export type KRIListResponse = CollectionListResponse<KeyRiskIndicator, KRIListCapabilities>;

// History types
export interface KRIHistoryEntry {
    id: number;
    kri_id: number;
    period_start: string;
    period_end: string;
    recorded_at: string;
    value: number;
    lower_limit: number;
    upper_limit: number;
    unit: string;
    breach_status: string;
    recorded_by_id?: number | null;
    recorded_by_name?: string | null;
}

export interface KRIHistoryCapabilities {
    can_request_correction: boolean;
}

export interface KRIHistoryListResponse {
    items: KRIHistoryEntry[];
    total: number;
    offset: number;
    limit: number;
    capabilities?: KRIHistoryCapabilities | null;
}

export interface KRIRecordValue {
    value: number;
    recorded_at?: string;
    period_end?: string;  // For privileged backdating
}

export interface KRIHistoryEdit {
    value: number;
    reason: string;
}

// Overdue KRI for dashboard
export interface OverdueKRI {
    kri_id: number;
    metric_name: string;
    frequency: string;
    period_end: string;
    due_date: string;
    days_overdue: number;
    reporting_owner_id?: number | null;
    reporting_owner_name?: string | null;
    risk_id: number;
}

// Due soon KRI for CRO dashboard (upcoming deadlines)
export interface DueSoonKRI {
    kri_id: number;
    metric_name: string;
    frequency: string;
    period_end: string;
    due_date: string;
    days_until_due: number;
    reporting_owner_id?: number | null;
    reporting_owner_name?: string | null;
    risk_id: number;
}
