export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueSeverityGroup = 'high_critical';
export type IssueSeverityFilter = IssueSeverity | IssueSeverityGroup;
export type IssueStatus = 'open' | 'triaged' | 'in_progress' | 'ready_for_validation' | 'closed';
export type IssueSourceType = 'manual' | 'control_execution' | 'kri_breach' | 'audit';
export type IssueRemediationStatus = 'draft' | 'active' | 'blocked' | 'completed';
export type IssueExceptionStatus = 'requested' | 'approved' | 'revoked' | 'expired';

export interface IssueLink {
    id: number;
    issue_id: number;
    risk_id: number | null;
    control_id: number | null;
    execution_id: number | null;
    kri_id: number | null;
    vendor_id?: number | null;
    linked_entity_type: string | null;
    linked_entity_name: string | null;
    created_at: string;
}

export interface IssueRemediationPlan {
    id: number;
    issue_id: number;
    status: IssueRemediationStatus;
    progress_percent: number;
    owner_user_id: number | null;
    owner_user_name: string | null;
    target_date: string | null;
    blocker_reason: string | null;
    completion_notes: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface IssueException {
    id: number;
    issue_id: number;
    status: IssueExceptionStatus;
    reason: string;
    requested_by_id: number | null;
    requested_by_name: string | null;
    approved_by_id: number | null;
    approved_by_name: string | null;
    requested_at: string | null;
    approved_at: string | null;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface IssueRiskContext {
    risk_id: number;
    risk_name: string;
    risk_category: string | null;
    risk_process: string | null;
    risk_type: string | null;
}

export interface IssueVendorContext {
    vendor_id: number;
    vendor_name: string;
}

export interface IssueCapabilities {
    can_read: boolean;
    can_update: boolean;
    can_change_department: boolean;
    can_assign_owner: boolean;
    can_clear_owner: boolean;
    can_start_remediation: boolean;
    can_update_remediation_progress: boolean;
    can_mark_remediation_blocked: boolean;
    can_mark_remediation_completed: boolean;
    can_request_exception: boolean;
    can_approve_exception: boolean;
    can_revoke_exception: boolean;
    can_close: boolean;
    can_link_risk: boolean;
    can_link_control: boolean;
    can_link_execution: boolean;
    can_link_kri: boolean;
    can_link_vendor: boolean;
    can_unlink_entities: boolean;
    can_view_risk_contexts: boolean;
    can_view_vendor_contexts: boolean;
    can_use_department_lookup: boolean;
    can_use_owner_lookup: boolean;
    is_owner: boolean;
    is_closed: boolean;
    has_active_exception: boolean;
    has_pending_exception_request: boolean;
}

export interface IssueSummary {
    id: number;
    title: string;
    severity: IssueSeverity;
    status: IssueStatus;
    source_type: IssueSourceType;
    source_id: number | null;
    department_id: number;
    department_name: string | null;
    owner_user_id: number | null;
    owner_user_name: string | null;
    opened_at: string;
    due_at: string | null;
    closed_at: string | null;
    created_at: string;
    updated_at: string;
    risk_contexts: IssueRiskContext[];
    vendor_contexts: IssueVendorContext[];
    capabilities?: IssueCapabilities | null;
}

export interface Issue extends IssueSummary {
    description: string | null;
    created_by_id: number | null;
    created_by_name: string | null;
    validation_note: string | null;
    links: IssueLink[];
    remediation_plan: IssueRemediationPlan | null;
    exceptions: IssueException[];
}

export type IssueListResponse = CollectionListResponse<IssueSummary>;

export interface IssueListFilters {
    offset?: number;
    limit?: number;
    status?: IssueStatus;
    severity?: IssueSeverity;
    severity_group?: IssueSeverityGroup;
    owner_user_id?: number;
    department_id?: number;
    overdue?: boolean;
    exclude_active_exceptions?: boolean;
    linked_risk_id?: number;
    linked_control_id?: number;
    linked_vendor_id?: number;
    search?: string;
    include_closed?: boolean;
    sort_by?: 'title' | 'severity' | 'status' | 'opened_at' | 'due_at' | 'updated_at' | 'created_at';
    sort_order?: 'asc' | 'desc';
    group_by?: string;
    group_value?: string;
}

export interface IssueCreatePayload {
    title: string;
    description?: string;
    severity?: IssueSeverity;
    source_type?: IssueSourceType;
    source_id?: number;
    department_id: number;
    owner_user_id?: number;
    due_at?: string;
}

export interface IssueUpdatePayload {
    title?: string;
    description?: string;
    severity?: IssueSeverity;
    status?: IssueStatus;
    source_type?: IssueSourceType;
    source_id?: number;
    owner_user_id?: number;
    due_at?: string;
    department_id?: number;
    validation_note?: string;
}

export interface IssueAssignPayload {
    owner_user_id: number;
    due_at: string;
    target_date?: string;
}

export interface IssueStartRemediationPayload {
    target_date?: string;
}

export interface IssueProgressPayload {
    progress_percent?: number;
    remediation_status?: IssueRemediationStatus;
    blocker_reason?: string;
    completion_notes?: string;
}

export interface IssueRequestExceptionPayload {
    reason: string;
}

export interface IssueApproveExceptionPayload {
    exception_id?: number;
    expires_at: string;
}

export interface IssueClosePayload {
    validation_note: string;
    completion_notes?: string;
}

export interface IssueDepartmentLookup {
    id: number;
    name: string;
    code: string;
}

export interface IssueOwnerLookup {
    id: number;
    name: string;
    role_name: string | null;
    department_name: string | null;
}

export interface IssueLinkPayload {
    risk_id?: number;
    control_id?: number;
    execution_id?: number;
    kri_id?: number;
    vendor_id?: number;
}

export type IssueContextEntityType = 'risk' | 'control' | 'execution' | 'kri' | 'vendor';

export interface IssueContextCreatePayload {
    entity_type: IssueContextEntityType;
    entity_id: number;
    title: string;
    description?: string;
    severity?: IssueSeverity;
    due_at?: string;
    owner_user_id?: number;
}
import type { CollectionListResponse } from '@/types/collection';
