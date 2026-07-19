import type {
    RiskAssetLink,
    RiskProcessLink,
    Threat,
    ThreatListItem,
    ThreatListResponse,
    ThreatRiskLink,
} from '@/types/threat';

import { collectionPaginationSchema, passthroughObject, z } from '../common';

export const threatCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
    can_archive: z.boolean(),
    can_restore: z.boolean(),
});

export const threatListCapabilitiesSchema = passthroughObject({
    can_create: z.boolean(),
    can_export: z.boolean(),
});

export const threatFacetOptionSchema = passthroughObject({
    value: z.string(),
    label: z.string(),
    count: z.number(),
    disabled: z.boolean(),
    selected: z.boolean(),
});

export const threatFacetsSchema = passthroughObject({
    lifecycle: z.array(threatFacetOptionSchema).optional(),
    category: z.array(threatFacetOptionSchema).optional(),
    relevant_subject: z.array(threatFacetOptionSchema).optional(),
    has_linked_risk: z.array(threatFacetOptionSchema).optional(),
    linked_risk_type: z.array(threatFacetOptionSchema).optional(),
});

export const threatLookupOptionSchema = passthroughObject({
    id: z.number(),
    label: z.string(),
    secondary_label: z.string().nullable().optional(),
    disabled: z.boolean(),
    count: z.number().nullable().optional(),
});

export const threatStewardSchema = passthroughObject({
    name: z.string(),
    email: z.string(),
    role_name: z.string(),
    department_name: z.string().nullable().optional(),
});

export const threatSchema: z.ZodType<Threat> = passthroughObject({
    id: z.number(),

    name: z.string(),
    threat_steward_user_id: z.number().nullable().optional(),
    threat_steward: threatStewardSchema.nullable().optional(),
    steward_orphaned: z.boolean().optional(),
    stewardship_status: z.enum([
        'assigned',
        'legacy_unassigned',
        'pending_governance',
        'invalid_assignment',
    ]).default('assigned'),
    category: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    typical_weaknesses: z.string().nullable().optional(),
    relevant_subject: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    is_archived: z.boolean(),
    archived_at: z.string().nullable().optional(),
    archived_by_id: z.number().nullable().optional(),
    capabilities: threatCapabilitiesSchema.nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
});

export const threatListItemSchema: z.ZodType<ThreatListItem> = z.intersection(
    threatSchema,
    passthroughObject({ visible_linked_risk_count: z.number() }),
);

export const threatListResponseSchema: z.ZodType<ThreatListResponse> =
    collectionPaginationSchema(threatListItemSchema).extend({
        capabilities: threatListCapabilitiesSchema.nullable().optional(),
        facets: threatFacetsSchema.nullable().optional(),
    });

export const threatRiskLinkCapabilitiesSchema = passthroughObject({
    can_delete: z.boolean(),
});

export const threatRiskLinkSchema: z.ZodType<ThreatRiskLink> = passthroughObject({
    id: z.number(),
    threat_id: z.number(),
    risk_id: z.number(),
    threat_name: z.string().nullable().optional(),
    risk_id_code: z.string().nullable().optional(),
    risk_name: z.string().nullable().optional(),
    capabilities: threatRiskLinkCapabilitiesSchema.nullable().optional(),
    created_at: z.string(),
});

export const threatRiskLinkListSchema = z.array(threatRiskLinkSchema);

export const riskProcessLinkCapabilitiesSchema = passthroughObject({
    can_delete: z.boolean(),
});

export const riskProcessLinkSchema: z.ZodType<RiskProcessLink> = passthroughObject({
    id: z.number(),
    risk_id: z.number(),
    process_id: z.number(),
    process_name: z.string().nullable().optional(),
    risk_id_code: z.string().nullable().optional(),
    risk_name: z.string().nullable().optional(),
    process_business_edit_blocked: z.boolean(),
    capabilities: riskProcessLinkCapabilitiesSchema.nullable().optional(),
    created_at: z.string(),
});

export const riskProcessLinkListSchema = z.array(riskProcessLinkSchema);

export const riskAssetLinkCapabilitiesSchema = passthroughObject({
    can_delete: z.boolean(),
});

export const riskAssetLinkSchema: z.ZodType<RiskAssetLink> = passthroughObject({
    id: z.number(),
    risk_id: z.number(),
    asset_id: z.number(),
    asset_name: z.string().nullable().optional(),
    risk_id_code: z.string().nullable().optional(),
    risk_name: z.string().nullable().optional(),
    capabilities: riskAssetLinkCapabilitiesSchema.nullable().optional(),
    created_at: z.string(),
});

export const riskAssetLinkListSchema = z.array(riskAssetLinkSchema);
