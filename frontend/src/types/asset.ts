export interface AssetCapabilities {
    can_read: boolean;
    can_update: boolean;
    can_archive: boolean;
    can_restore: boolean;
}

export interface AssetListCapabilities {
    can_create?: boolean;
}

/** The signals, ranks, and parameter values behind the derived block. */
export interface AssetDerivedInputs {
    confidentiality_rating?: number | null;
    integrity_rating?: number | null;
    availability_rating?: number | null;
    authenticity_rating?: number | null;
    impact_client?: number | null;
    impact_regulatory?: number | null;
    substitutability_rating?: number | null;
    vendor_dependency_rating?: number | null;
    preliminary_criticality?: string | null;
    lifecycle_state?: string | null;
    standard_support_end_date?: string | null;
    reference_date: string;
    threshold_low_score: number;
    threshold_medium_score: number;
    threshold_high_score: number;
    primary_process_id?: number | null;
    rank_primary_process_criticality: number;
    rank_score_criticality: number;
    rank_preliminary_criticality: number;
    rank_business_criticality: number;
    rank_cif_floor: number;
    /** 04!hotovo ingredients (#49): the blank completeness cells, span order. */
    missing_for_completeness: string[];
}

/** Engine-derived 04_Aktiva values (ticket #48) — read-only, computed on read. */
export interface AssetDerived {
    ciaa_value?: number | null;
    primary_process_name?: string | null;
    primary_process_criticality?: string | null;
    inherited_impact_operations?: number | null;
    inherited_impact_financial?: number | null;
    inherited_rto_hours?: number | null;
    business_criticality?: string | null;
    weighted_score?: number | null;
    score_criticality?: string | null;
    h_rank: number;
    resulting_criticality?: string | null;
    article8_classification: string;
    cif: string;
    cif_process_count: number;
    cif_process_names: string[];
    spof: string;
    external_dependency: string;
    legacy: string;
    linked_process_count: number;
    linked_vendor_count: number;
    linked_asset_names: string[];
    vendor_names: string[];
    ict_service_codes: string[];
    contract_references: string[];
    /** 04!hotovo (#49): true iff every completeness span is filled. */
    is_complete: boolean;
    inputs: AssetDerivedInputs;
}

export interface Asset {
    id: number;

    name: string;
    asset_type?: string | null;
    asset_level?: string | null;
    description?: string | null;
    physical_location?: string | null;
    deployment_model?: string | null;
    alternative_names?: string | null;

    business_owner?: string | null;
    owner_department?: string | null;
    ict_owner?: string | null;
    gdpr_relevance?: string | null;
    ai_relevance?: string | null;
    data_classification?: string | null;

    confidentiality_rating?: number | null;
    integrity_rating?: number | null;
    availability_rating?: number | null;
    authenticity_rating?: number | null;

    impact_client?: number | null;
    impact_regulatory?: number | null;

    substitutability_rating?: number | null;
    vendor_dependency_rating?: number | null;
    internet_exposed?: string | null;

    preliminary_criticality?: string | null;

    lifecycle_state?: string | null;
    standard_support_end_date?: string | null;
    extended_support_end_date?: string | null;
    custom_support_end_date?: string | null;
    last_legacy_risk_assessment_date?: string | null;

    review_state?: string | null;
    notes?: string | null;

    /** The designated primary Process among this Asset's links (at most one). */
    primary_process_id?: number | null;

    derived?: AssetDerived | null;

    is_archived: boolean;
    archived_at?: string | null;
    archived_by_id?: number | null;
    capabilities?: AssetCapabilities | null;
    created_at: string;
    updated_at: string;
}

export interface AssetWritePayload {
    name?: string;
    asset_type?: string | null;
    asset_level?: string | null;
    description?: string | null;
    physical_location?: string | null;
    deployment_model?: string | null;
    alternative_names?: string | null;
    business_owner?: string | null;
    owner_department?: string | null;
    ict_owner?: string | null;
    gdpr_relevance?: string | null;
    ai_relevance?: string | null;
    data_classification?: string | null;
    confidentiality_rating?: number | null;
    integrity_rating?: number | null;
    availability_rating?: number | null;
    authenticity_rating?: number | null;
    impact_client?: number | null;
    impact_regulatory?: number | null;
    substitutability_rating?: number | null;
    vendor_dependency_rating?: number | null;
    internet_exposed?: string | null;
    preliminary_criticality?: string | null;
    lifecycle_state?: string | null;
    standard_support_end_date?: string | null;
    extended_support_end_date?: string | null;
    custom_support_end_date?: string | null;
    last_legacy_risk_assessment_date?: string | null;
    review_state?: string | null;
    notes?: string | null;
}

export interface AssetListParams {
    offset: number;
    limit: number;
    search?: string;
    include_archived?: boolean;
    sort_by?: AssetSortField;
    sort_order?: 'asc' | 'desc';
    has_process_link?: boolean;
    criticality?: string;
}

export type AssetSortField = 'name' | 'asset_type' | 'owner_department' | 'lifecycle_state' | 'created_at';

export interface AssetListResponse {
    items: Asset[];
    total: number;
    offset: number;
    limit: number;
    capabilities?: AssetListCapabilities | null;
}

export interface ProcessAssetLink {
    id: number;
    process_id: number;
    asset_id: number;
    /** Server-resolved display names (FRONTEND_DISPLAY_GUARDRAILS: no raw-id fallbacks). */
    process_name?: string | null;
    asset_name?: string | null;
    significance?: string | null;
    spof?: string | null;
    is_primary: boolean;
    note?: string | null;
    created_at: string;
}

export interface ProcessAssetLinkCreatePayload {
    process_id: number;
    significance?: string | null;
    spof?: string | null;
    is_primary?: boolean;
    note?: string | null;
}

export interface ProcessAssetLinkUpdatePayload {
    significance?: string | null;
    spof?: string | null;
    is_primary?: boolean;
    note?: string | null;
}

export interface AssetAssetLink {
    id: number;
    dependent_asset_id: number;
    supporting_asset_id: number;
    /** Server-resolved display names (FRONTEND_DISPLAY_GUARDRAILS: no raw-id fallbacks). */
    dependent_asset_name?: string | null;
    supporting_asset_name?: string | null;
    dependency_type?: string | null;
    spof?: string | null;
    note?: string | null;
    created_at: string;
}

export interface AssetAssetLinkCreatePayload {
    dependent_asset_id: number;
    supporting_asset_id: number;
    dependency_type?: string | null;
    spof?: string | null;
    note?: string | null;
}

export interface AssetVendorLinkCapabilities {
    /** Mutations follow the REGISTER end: assets:write (plus both reads). */
    can_delete: boolean;
}

/** Asset<->Vendor Link relation (workbook sheet 10_VAD), typed by an S-code. */
export interface AssetVendorLink {
    id: number;
    asset_id: number;
    vendor_id: number;
    /** Server-resolved display names (FRONTEND_DISPLAY_GUARDRAILS: no raw-id fallbacks). */
    asset_name?: string | null;
    vendor_name?: string | null;
    vendor_role?: string | null;
    ict_service_code: string;
    contract_reference?: string | null;
    reliance?: string | null;
    note?: string | null;
    capabilities?: AssetVendorLinkCapabilities | null;
    created_at: string;
}

export interface AssetVendorLinkCreatePayload {
    vendor_id: number;
    vendor_role?: string | null;
    ict_service_code: string;
    contract_reference?: string | null;
    reliance?: string | null;
    note?: string | null;
}
