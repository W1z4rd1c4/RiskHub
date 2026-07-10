export interface ThreatCapabilities {
    can_read: boolean;
    can_update: boolean;
    can_archive: boolean;
    can_restore: boolean;
}

export interface ThreatListCapabilities {
    can_create?: boolean;
}

/** ICT Register Threat — the entered 12_Hrozby columns (issue #47). */
export interface Threat {
    id: number;

    name: string;
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

export interface ThreatWritePayload {
    name?: string;
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
}

export type ThreatSortField = 'name' | 'category' | 'relevant_subject' | 'created_at';

export interface ThreatListResponse {
    items: Threat[];
    total: number;
    offset: number;
    limit: number;
    capabilities?: ThreatListCapabilities | null;
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
    capabilities?: RiskAssetLinkCapabilities | null;
    created_at: string;
}
