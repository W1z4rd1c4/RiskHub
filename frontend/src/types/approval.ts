export type ApprovalStatus = 'pending' | 'pending_privileged' | 'approved' | 'rejected' | 'cancelled' | 'expired';
export type ApprovalResourceType = 'risk' | 'control' | 'kri' | 'process';
export type ApprovalActionType = 'delete' | 'edit' | 'create' | 'archive';

export interface PendingChange {
    old: unknown;
    new: unknown;
}

export interface GovernedDerivedState {
    cif: string;
    criticality_class: string | null;
}

export interface GovernedEditDerivedImpact {
    before: GovernedDerivedState;
    after: GovernedDerivedState;
}

export interface GovernedCreateDerivedImpact {
    before: null;
    after: GovernedDerivedState;
}

export interface GovernedRelationshipProcessImpact {
    resource_name: string;
    before: GovernedDerivedState;
    after: GovernedDerivedState;
}

export interface GovernedRelationshipDerivedImpact {
    processes: GovernedRelationshipProcessImpact[];
}

export type GovernedDerivedImpact =
    | GovernedEditDerivedImpact
    | GovernedCreateDerivedImpact
    | GovernedRelationshipDerivedImpact;

export type GovernedRelationshipSnapshotValue = string | boolean | null;

export const GOVERNED_MUTATION_KINDS = [
    'process.edit',
    'process.create',
    'process.archive',
    'process.link.risk.add',
    'process.link.risk.remove',
    'process.link.asset.add',
    'process.link.asset.update',
    'process.link.asset.remove',
    'process.link.vendor.add',
    'process.link.vendor.remove',
] as const;

export type GovernedMutationKind = typeof GOVERNED_MUTATION_KINDS[number];
export type GovernedPointMutationKind = 'process.edit' | 'process.create' | 'process.archive';
export type GovernedRelationshipMutationKind = Exclude<GovernedMutationKind, GovernedPointMutationKind>;
export type GovernedImpactResourceType = 'process';
export type GovernedRelationshipResourceType = 'risk' | 'asset' | 'vendor';

export interface GovernedRelationshipChange {
    target_resource_type: GovernedRelationshipResourceType;
    target_resource_name: string;
    action: 'add' | 'update' | 'remove';
    before: Record<string, GovernedRelationshipSnapshotValue>;
    after: Record<string, GovernedRelationshipSnapshotValue>;
}

export interface GovernedImpactedResource {
    resource_type: GovernedImpactResourceType;
    resource_name: string;
}

interface GovernedMutationReadBase {
    proposal_id: string;
    proposal_version: number;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    impacted_resources: GovernedImpactedResource[];
}

export type GovernedMutationRead = GovernedMutationReadBase & (
    | {
        mutation_kind: 'process.create';
        derived_impact: GovernedCreateDerivedImpact;
        relationship_change: null;
    }
    | {
        mutation_kind: 'process.edit' | 'process.archive';
        derived_impact: GovernedEditDerivedImpact;
        relationship_change: null;
    }
    | {
        mutation_kind: GovernedRelationshipMutationKind;
        derived_impact: GovernedRelationshipDerivedImpact;
        relationship_change: GovernedRelationshipChange;
    }
);

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
    resource_id: number | null;
    resource_name: string;
    action_type: ApprovalActionType;
    pending_changes: Record<string, PendingChange> | null;
    governed_mutation?: GovernedMutationRead | null;
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
    resource_id?: number | null;
    pending_fields: string[];
    pending_changes?: Record<string, unknown> | null;
    primary_approver_id?: number | null;
    requires_privileged_approval?: boolean;
}

export function isApprovalCreatedResponse(response: unknown): response is ApprovalCreatedResponse {
    return typeof response === 'object' && response !== null && 'approval_id' in response && 'status' in response;
}
