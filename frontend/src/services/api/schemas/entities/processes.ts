import type { Process, ProcessListResponse, ProcessVendorLink } from '@/types/process';

import { collectionPaginationSchema, passthroughObject, z } from '../common';

export const processCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
    can_archive: z.boolean(),
    can_restore: z.boolean(),
});

export const processListCapabilitiesSchema = passthroughObject({
    can_create: z.boolean().optional(),
});

// Engine-derived block (ticket #48): read-only values computed on read, with
// the explain inputs that produced them.
export const processDerivedInputsSchema = passthroughObject({
    impact_client: z.number().nullable().optional(),
    impact_market_operations: z.number().nullable().optional(),
    impact_regulatory: z.number().nullable().optional(),
    impact_financial: z.number().nullable().optional(),
    mtpd_hours: z.number().nullable().optional(),
    mtpd_bonus: z.number().nullable().optional(),
    threshold_critical_score: z.number(),
    threshold_high_score: z.number(),
    threshold_medium_score: z.number(),
    mtpd_critical_hours: z.number(),
    mtpd_medium_hours: z.number(),
    preliminary_criticality: z.string().nullable().optional(),
    criticality_class_source: z.string(),
    cif_override: z.string().nullable().optional(),
    cif_class_critical: z.boolean(),
    cif_mtpd_within_critical: z.boolean(),
    cif_any_impact_maximal: z.boolean(),
    rto_hours: z.number().nullable().optional(),
    bcm_link: z.string().nullable().optional(),
    assessment_date: z.string().nullable().optional(),
    missing_for_completeness: z.array(z.string()),
    manual_vendor_link_count: z.number(),
    transitive_vendor_pair_count: z.number(),
});

/** One derived 11 §2 row (#49): a (Process, Vendor) pair implied via an Asset. */
export const processTransitiveVendorLinkSchema = passthroughObject({
    process_id: z.number(),
    process_name: z.string(),
    process_cif: z.string().nullable().optional(),
    process_criticality: z.string().nullable().optional(),
    vendor_id: z.number(),
    vendor_name: z.string(),
    via_asset_id: z.number(),
    via_asset_name: z.string(),
});

export const processDerivedSchema = passthroughObject({
    criticality_score: z.number().nullable().optional(),
    criticality_class: z.string().nullable().optional(),
    cif: z.string(),
    rto_mtpd_check: z.string().nullable().optional(),
    bcm_check: z.string(),
    next_review_date: z.string().nullable().optional(),
    linked_asset_count: z.number(),
    linked_vendor_count: z.number(),
    is_complete: z.boolean(),
    is_duplicate: z.boolean(),
    inputs: processDerivedInputsSchema,
    transitive_vendor_links: z.array(processTransitiveVendorLinkSchema),
});

export const processSchema: z.ZodType<Process> = passthroughObject({
    id: z.number(),
    f_code: z.string(),

    l0_area: z.string(),
    l1_process: z.string(),
    l2_subprocess: z.string().nullable().optional(),

    owner: z.string().nullable().optional(),
    owner_department: z.string().nullable().optional(),

    impact_client: z.number().nullable().optional(),
    impact_market_operations: z.number().nullable().optional(),
    impact_regulatory: z.number().nullable().optional(),
    impact_financial: z.number().nullable().optional(),
    impact_reputational: z.number().nullable().optional(),
    mtpd_hours: z.number().nullable().optional(),

    preliminary_criticality: z.string().nullable().optional(),
    cif_override: z.string().nullable().optional(),

    licensed_activity: z.string().nullable().optional(),

    rto_hours: z.number().nullable().optional(),
    rpo_hours: z.number().nullable().optional(),
    bcm_link: z.string().nullable().optional(),
    last_dr_test_date: z.string().nullable().optional(),
    dr_test_result: z.string().nullable().optional(),

    interruption_impact: z.string().nullable().optional(),
    assessment_date: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),

    derived: processDerivedSchema.nullable().optional(),

    is_archived: z.boolean(),
    archived_at: z.string().nullable().optional(),
    archived_by_id: z.number().nullable().optional(),
    capabilities: processCapabilitiesSchema.nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
});

export const processListResponseSchema: z.ZodType<ProcessListResponse> =
    collectionPaginationSchema(processSchema).extend({
        capabilities: processListCapabilitiesSchema.nullable().optional(),
    });

export const ictClosedListSchema = passthroughObject({
    name: z.string(),
    values: z.array(z.union([z.string(), z.number()])),
});

export const ictClosedListCollectionSchema = passthroughObject({
    lists: z.array(ictClosedListSchema),
});

export const processVendorLinkCapabilitiesSchema = passthroughObject({
    can_delete: z.boolean(),
});

export const processVendorLinkSchema: z.ZodType<ProcessVendorLink> = passthroughObject({
    id: z.number(),
    process_id: z.number(),
    vendor_id: z.number(),
    direct_service_description: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    capabilities: processVendorLinkCapabilitiesSchema.nullable().optional(),
    created_at: z.string(),
});

export const processVendorLinkListSchema = z.array(processVendorLinkSchema);
