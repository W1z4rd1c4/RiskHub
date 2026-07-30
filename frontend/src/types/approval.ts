export type ApprovalStatus = 'pending' | 'pending_privileged' | 'approved' | 'rejected' | 'cancelled' | 'expired';
export type ApprovalResourceType = 'risk' | 'control' | 'kri' | 'process' | 'asset' | 'vendor' | 'threat';
export type ApprovalActionType = 'delete' | 'edit' | 'create' | 'archive';

export interface PendingChange {
    old: unknown;
    new: unknown;
}

export interface GovernedDerivedState {
    cif: string;
    criticality_class: string | null;
}

export interface GovernedAssetDerivedState {
    cif: string;
    resulting_criticality: string | null;
}

export interface GovernedVendorDerivedState {
    tier: string | null;
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

export interface GovernedRelationshipAssetImpact {
    resource_name: string;
    before: GovernedAssetDerivedState;
    after: GovernedAssetDerivedState;
}

export interface GovernedRelationshipVendorImpact {
    resource_name: string;
    before: GovernedVendorDerivedState;
    after: GovernedVendorDerivedState;
}

export interface GovernedRelationshipDerivedImpact {
    processes?: GovernedRelationshipProcessImpact[];
    assets?: GovernedRelationshipAssetImpact[];
    vendors?: GovernedRelationshipVendorImpact[];
}

export interface GovernedAssetEditDerivedImpact {
    before: GovernedAssetDerivedState;
    after: GovernedAssetDerivedState;
}

export interface GovernedAssetCreateDerivedImpact {
    before: null;
    after: GovernedAssetDerivedState;
}

export interface GovernedVendorEditDerivedImpact {
    before: GovernedVendorDerivedState;
    after: GovernedVendorDerivedState;
}

export interface GovernedVendorCreateDerivedImpact {
    before: null;
    after: GovernedVendorDerivedState;
}

export interface GovernedThreatEditDerivedImpact {
    before: Record<string, never>;
    after: Record<string, never>;
}

export type GovernedDerivedImpact =
    | GovernedEditDerivedImpact
    | GovernedCreateDerivedImpact
    | GovernedAssetEditDerivedImpact
    | GovernedAssetCreateDerivedImpact
    | GovernedVendorEditDerivedImpact
    | GovernedVendorCreateDerivedImpact
    | GovernedThreatEditDerivedImpact
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
    'asset.create',
    'asset.edit',
    'asset.archive',
    'asset.link.asset.add',
    'asset.link.asset.remove',
    'asset.link.vendor.add',
    'asset.link.vendor.remove',
    'asset.link.risk.add',
    'asset.link.risk.remove',
    'vendor.create',
    'vendor.edit',
    'vendor.archive',
    'vendor.contract.create',
    'vendor.contract.edit',
    'vendor.contract.archive',
    'vendor.sub_outsourcing.create',
    'vendor.sub_outsourcing.edit',
    'vendor.sub_outsourcing.archive',
    'vendor.link.risk.add',
    'vendor.link.risk.remove',
    'vendor.link.control.add',
    'vendor.link.control.remove',
    'vendor.link.kri.add',
    'vendor.link.kri.remove',
    'threat.edit',
] as const;

export type GovernedMutationKind = typeof GOVERNED_MUTATION_KINDS[number];
export type GovernedPointMutationKind =
    | 'process.edit' | 'process.create' | 'process.archive'
    | 'asset.edit' | 'asset.create' | 'asset.archive'
    | 'vendor.edit' | 'vendor.create' | 'vendor.archive'
    | 'threat.edit'
    | 'vendor.contract.create' | 'vendor.contract.edit' | 'vendor.contract.archive'
    | 'vendor.sub_outsourcing.create' | 'vendor.sub_outsourcing.edit' | 'vendor.sub_outsourcing.archive';
export type GovernedRelationshipMutationKind = Exclude<GovernedMutationKind, GovernedPointMutationKind>;
export type GovernedImpactResourceType = 'process' | 'asset' | 'vendor' | 'threat';
export type GovernedRelationshipResourceType = 'risk' | 'asset' | 'vendor' | 'control' | 'kri';

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

export type GovernedMutationRead = GovernedMutationReadBase & {
    mutation_kind: GovernedMutationKind;
    derived_impact: GovernedDerivedImpact;
    relationship_change: GovernedRelationshipChange | null;
};

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
