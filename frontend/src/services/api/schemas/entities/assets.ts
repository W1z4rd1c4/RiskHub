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
