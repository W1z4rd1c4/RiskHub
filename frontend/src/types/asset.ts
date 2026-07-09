export interface AssetCapabilities {
    can_read: boolean;
    can_update: boolean;
    can_archive: boolean;
    can_restore: boolean;
}

export interface AssetListCapabilities {
    can_create?: boolean;
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
