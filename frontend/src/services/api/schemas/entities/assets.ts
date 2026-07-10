import type { Asset, AssetAssetLink, AssetListResponse, ProcessAssetLink } from '@/types/asset';

import { collectionPaginationSchema, passthroughObject, z } from '../common';

export const assetCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
    can_archive: z.boolean(),
    can_restore: z.boolean(),
});

export const assetListCapabilitiesSchema = passthroughObject({
    can_create: z.boolean().optional(),
});

// Engine-derived block (ticket #48): read-only values computed on read, with
// the explain inputs (h_rank signals, parameter thresholds) behind them.
export const assetDerivedInputsSchema = passthroughObject({
    confidentiality_rating: z.number().nullable().optional(),
    integrity_rating: z.number().nullable().optional(),
    availability_rating: z.number().nullable().optional(),
    authenticity_rating: z.number().nullable().optional(),
    impact_client: z.number().nullable().optional(),
    impact_regulatory: z.number().nullable().optional(),
    substitutability_rating: z.number().nullable().optional(),
    vendor_dependency_rating: z.number().nullable().optional(),
    preliminary_criticality: z.string().nullable().optional(),
    lifecycle_state: z.string().nullable().optional(),
    standard_support_end_date: z.string().nullable().optional(),
    reference_date: z.string(),
    threshold_low_score: z.number(),
    threshold_medium_score: z.number(),
    threshold_high_score: z.number(),
    primary_process_id: z.number().nullable().optional(),
    rank_primary_process_criticality: z.number(),
    rank_score_criticality: z.number(),
    rank_preliminary_criticality: z.number(),
    rank_business_criticality: z.number(),
    rank_cif_floor: z.number(),
});

export const assetDerivedSchema = passthroughObject({
    ciaa_value: z.number().nullable().optional(),
    primary_process_name: z.string().nullable().optional(),
    primary_process_criticality: z.string().nullable().optional(),
    inherited_impact_operations: z.number().nullable().optional(),
    inherited_impact_financial: z.number().nullable().optional(),
    inherited_rto_hours: z.number().nullable().optional(),
    business_criticality: z.string().nullable().optional(),
    weighted_score: z.number().nullable().optional(),
    score_criticality: z.string().nullable().optional(),
    h_rank: z.number(),
    resulting_criticality: z.string().nullable().optional(),
    article8_classification: z.string(),
    cif: z.string(),
    cif_process_count: z.number(),
    cif_process_names: z.array(z.string()),
    spof: z.string(),
    external_dependency: z.string(),
    legacy: z.string(),
    linked_process_count: z.number(),
    linked_vendor_count: z.number(),
    linked_asset_names: z.array(z.string()),
    vendor_names: z.array(z.string()),
    ict_service_codes: z.array(z.string()),
    contract_references: z.array(z.string()),
    inputs: assetDerivedInputsSchema,
});

export const assetSchema: z.ZodType<Asset> = passthroughObject({
    id: z.number(),

    name: z.string(),
    asset_type: z.string().nullable().optional(),
    asset_level: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    physical_location: z.string().nullable().optional(),
    deployment_model: z.string().nullable().optional(),
    alternative_names: z.string().nullable().optional(),

    business_owner: z.string().nullable().optional(),
    owner_department: z.string().nullable().optional(),
    ict_owner: z.string().nullable().optional(),
    gdpr_relevance: z.string().nullable().optional(),
    ai_relevance: z.string().nullable().optional(),
    data_classification: z.string().nullable().optional(),

    confidentiality_rating: z.number().nullable().optional(),
    integrity_rating: z.number().nullable().optional(),
    availability_rating: z.number().nullable().optional(),
    authenticity_rating: z.number().nullable().optional(),

    impact_client: z.number().nullable().optional(),
    impact_regulatory: z.number().nullable().optional(),

    substitutability_rating: z.number().nullable().optional(),
    vendor_dependency_rating: z.number().nullable().optional(),
    internet_exposed: z.string().nullable().optional(),

    preliminary_criticality: z.string().nullable().optional(),

    lifecycle_state: z.string().nullable().optional(),
    standard_support_end_date: z.string().nullable().optional(),
    extended_support_end_date: z.string().nullable().optional(),
    custom_support_end_date: z.string().nullable().optional(),
    last_legacy_risk_assessment_date: z.string().nullable().optional(),

    review_state: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),

    primary_process_id: z.number().nullable().optional(),

    derived: assetDerivedSchema.nullable().optional(),

    is_archived: z.boolean(),
    archived_at: z.string().nullable().optional(),
    archived_by_id: z.number().nullable().optional(),
    capabilities: assetCapabilitiesSchema.nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
});

export const assetListResponseSchema: z.ZodType<AssetListResponse> =
    collectionPaginationSchema(assetSchema).extend({
        capabilities: assetListCapabilitiesSchema.nullable().optional(),
    });

export const processAssetLinkSchema: z.ZodType<ProcessAssetLink> = passthroughObject({
    id: z.number(),
    process_id: z.number(),
    asset_id: z.number(),
    significance: z.string().nullable().optional(),
    spof: z.string().nullable().optional(),
    is_primary: z.boolean(),
    note: z.string().nullable().optional(),
    created_at: z.string(),
});

export const processAssetLinkListSchema = z.array(processAssetLinkSchema);

export const assetAssetLinkSchema: z.ZodType<AssetAssetLink> = passthroughObject({
    id: z.number(),
    dependent_asset_id: z.number(),
    supporting_asset_id: z.number(),
    dependency_type: z.string().nullable().optional(),
    spof: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    created_at: z.string(),
});

export const assetAssetLinkListSchema = z.array(assetAssetLinkSchema);
