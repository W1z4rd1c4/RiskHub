import type { CollectionGroup } from './collection';

export interface ThreatCapabilities {
    can_read: boolean;
    can_update: boolean;
    can_archive: boolean;
    can_restore: boolean;
}

export interface ThreatListCapabilities {
    can_create: boolean;
    can_export: boolean;
}

export interface ThreatFacetOption {
    value: string;
    label: string;
    count: number;
    disabled: boolean;
    selected: boolean;
}

export type ThreatFacetKey =
    | 'lifecycle'
    | 'category'
    | 'relevant_subject'
    | 'has_linked_risk'
    | 'linked_risk_type';

export type ThreatFacets = Partial<Record<ThreatFacetKey, ThreatFacetOption[]>>;

export interface ThreatLookupOption {
    id: number;
    label: string;
    secondary_label?: string | null;
    disabled: boolean;
    count?: number | null;
}

export interface ThreatSteward {
    name: string;
    email: string;
    role_name: string;
    department_name?: string | null;
}

export type ThreatStewardshipStatus =
    | 'assigned'
    | 'legacy_unassigned'
    | 'pending_governance'
    | 'invalid_assignment';

/** ICT Register Threat — the entered 12_Hrozby columns (issue #47). */
export interface Threat {
    id: number;

    name: string;
    threat_steward_user_id?: number | null;
    threat_steward?: ThreatSteward | null;
    steward_orphaned?: boolean;
    stewardship_status: ThreatStewardshipStatus;
    category?: string | null;
    description?: string | null;
    typical_weaknesses?: string | null;
    relevant_subject?: string | null;
    notes?: string | null;
    is_archived: boolean;
    archived_at?: string | null;
    archived_by_id?: number | null;
    capabilities?: ThreatCapabilities | null;
    created_at: string;
    updated_at: string;
}

export interface ThreatListItem extends Threat {
    visible_linked_risk_count: number;
}

export interface ThreatWritePayload {
    name?: string;
    threat_steward_user_id?: number | null;
    category?: string | null;
    description?: string | null;
    typical_weaknesses?: string | null;
    relevant_subject?: string | null;
    notes?: string | null;
}

export interface ThreatListParams {
    offset: number;
    limit: number;
    search?: string;
    include_archived?: boolean;
    sort_by?: ThreatSortField;
    sort_order?: 'asc' | 'desc';
    sort?: { field: string; direction: 'asc' | 'desc' };
    lifecycle?: Array<'active' | 'archived'>;
    view?: ThreatRegisterView;
    group_by?: ThreatGroupBy;
    group_value?: string;
    categories?: string[];
    steward_ids?: number[];
    relevant_subjects?: string[];
    has_linked_risk?: boolean;
    linked_risk_ids?: number[];
    linked_risk_types?: string[];
    linked_risk_department_ids?: number[];
}

export type ThreatRegisterView = 'all' | 'category' | 'threat_steward' | 'relevant_subject' | 'linked_risk';
export type ThreatGroupBy = Exclude<ThreatRegisterView, 'all'>;
export type ThreatSortField =
    | 'name'
    | 'category'
    | 'threat_steward'
    | 'relevant_subject'
    | 'linked_risk_count'
    | 'created_at';

export interface ThreatListResponse {
    items: ThreatListItem[];
    total: number;
    offset: number;
    limit: number;
    capabilities?: ThreatListCapabilities | null;
    groups?: CollectionGroup[] | null;
    facets?: ThreatFacets | null;
}

export interface ThreatRiskLinkCapabilities {
    /** Mutations follow the MANAGING end: threats:write on the Threat page, risks:write on the Risk detail. */
    can_delete: boolean;
}

/** Threat<->Risk Link relation (issue #47), manageable from both ends. */
export interface ThreatRiskLink {
    id: number;
    threat_id: number;
    risk_id: number;
    /** Server-resolved display names (FRONTEND_DISPLAY_GUARDRAILS: no raw-id fallbacks). */
    threat_name?: string | null;
    risk_id_code?: string | null;
    risk_name?: string | null;
    capabilities?: ThreatRiskLinkCapabilities | null;
    created_at: string;
}

export interface RiskProcessLinkCapabilities {
    /** Mutations follow the Risk end (risks:write). */
    can_delete: boolean;
}

/** Risk<->Process Link relation (issue #47), managed from the Risk detail. */
export interface RiskProcessLink {
    id: number;
    risk_id: number;
    process_id: number;
    /** Server-resolved display names (FRONTEND_DISPLAY_GUARDRAILS: no raw-id fallbacks). */
    process_name?: string | null;
    risk_id_code?: string | null;
    risk_name?: string | null;
    capabilities?: RiskProcessLinkCapabilities | null;
    created_at: string;
}

export interface RiskAssetLinkCapabilities {
    /** Mutations follow the Risk end (risks:write). */
    can_delete: boolean;
}

/** Risk<->Asset Link relation (issue #47), managed from the Risk detail. */
export interface RiskAssetLink {
    id: number;
    risk_id: number;
    asset_id: number;
    /** Server-resolved display names (FRONTEND_DISPLAY_GUARDRAILS: no raw-id fallbacks). */
    asset_name?: string | null;
    risk_id_code?: string | null;
    risk_name?: string | null;
    capabilities?: RiskAssetLinkCapabilities | null;
    created_at: string;
}
