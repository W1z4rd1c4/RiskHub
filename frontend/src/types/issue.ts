export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
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

export interface IssueListResponse {
    items: IssueSummary[];
    total: number;
    skip: number;
    limit: number;
}

export interface IssueListFilters {
    skip?: number;
    limit?: number;
    status?: IssueStatus;
    severity?: IssueSeverity;
    owner_user_id?: number;
    department_id?: number;
    overdue?: boolean;
    linked_risk_id?: number;
    linked_control_id?: number;
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
}
