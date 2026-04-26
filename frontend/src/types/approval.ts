export type ApprovalStatus = 'pending' | 'pending_privileged' | 'approved' | 'rejected' | 'cancelled';
export type ApprovalResourceType = 'risk' | 'control' | 'kri';
export type ApprovalActionType = 'delete' | 'edit';

export interface PendingChange {
    old: unknown;
    new: unknown;
}

export interface ApprovalRequestCapabilities {
    can_read: boolean;
    can_approve: boolean;
    can_reject: boolean;
    can_cancel: boolean;
    can_cancel_as_requester: boolean;
    can_cancel_as_resolver: boolean;
    can_view_pending_changes: boolean;
    can_view_resolution_notes: boolean;
    can_inspect_side_effects: boolean;
    is_requester: boolean;
    is_primary_approver: boolean;
    is_privileged_resolver: boolean;
    is_pending: boolean;
    requires_privileged_resolution: boolean;
    would_apply_side_effects_on_approve: boolean;
}

export interface ApprovalRequest {
    id: number;
    resource_type: ApprovalResourceType;
    resource_id: number;
    resource_name: string;
    action_type: ApprovalActionType;
    pending_changes: Record<string, PendingChange> | null;
    status: ApprovalStatus;
    reason: string;
    requested_by_id: number;
    requested_by_name: string | null;
    requested_by_email: string | null;
    resolved_by_id: number | null;
    resolved_by_name: string | null;
    resolved_at: string | null;
    resolution_notes: string | null;
    created_at: string;
    can_approve: boolean;
    can_reject: boolean;
    capabilities?: ApprovalRequestCapabilities | null;
}

export interface ApprovalListResponse {
    items: ApprovalRequest[];
    total: number;
    skip: number;
    limit: number;
}

export interface CreateApprovalRequest {
    resource_type: ApprovalResourceType;
    resource_id: number;
    reason: string;
}

export interface ResolveApprovalRequest {
    resolution_notes: string;
}

/**
 * Response when an edit/delete requires approval (HTTP 202).
 * Indicates the change was queued for approval rather than applied immediately.
 */
export interface ApprovalCreatedResponse {
    status: 'approval_required';
    message: string;
    approval_id: number;
    action_type: ApprovalActionType;
    pending_fields: string[];
    pending_changes?: Record<string, unknown> | null;
    primary_approver_id?: number | null;
    requires_privileged_approval?: boolean;
}

export function isApprovalCreatedResponse(response: unknown): response is ApprovalCreatedResponse {
    return typeof response === 'object' && response !== null && 'approval_id' in response && 'status' in response;
}
