export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ApprovalResourceType = 'risk' | 'control' | 'kri';
export type ApprovalActionType = 'delete' | 'edit';

export interface PendingChange {
    old: unknown;
    new: unknown;
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
