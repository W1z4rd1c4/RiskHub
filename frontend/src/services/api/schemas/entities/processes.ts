import type {
    Process,
    ProcessApprovalQueuedResponse,
    ProcessListResponse,
    ProcessPendingCreationRead,
    ProcessPendingChangeRead,
    ProcessVendorLink,
} from '@/types/process';

import { collectionPaginationSchema, passthroughObject, z } from '../common';
import { approvalCreatedResponseSchema, governedDerivedImpactSchema } from '../workflow';

export const processCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
    can_archive: z.boolean(),
    can_restore: z.boolean(),
    protected_change_requires_approval: z.boolean(),
    can_request_change: z.boolean(),
    can_cancel_pending_change: z.boolean(),
    has_pending_change: z.boolean(),
    business_edit_blocked: z.boolean(),
});

export const processPendingChangeSchema: z.ZodType<ProcessPendingChangeRead> = passthroughObject({
    approval_id: z.number(),
    proposal_id: z.string(),
    proposal_version: z.number(),
    status: z.literal('pending'),
    requested_at: z.string(),
    requested_by_name: z.string().nullable(),
    reason: z.string(),
    before: z.record(z.string(), z.unknown()),
    after: z.record(z.string(), z.unknown()),
    derived_impact: governedDerivedImpactSchema,
    capabilities: passthroughObject({
        can_view_diff: z.boolean(),
        can_cancel: z.boolean(),
    }),
});

export const processApprovalQueuedResponseSchema: z.ZodType<ProcessApprovalQueuedResponse> =
    approvalCreatedResponseSchema.omit({ resource_id: true }).extend({
        proposal_id: z.string(),
        proposal_version: z.number(),
    });

const processPendingCreationProposalSchema = z.strictObject({
    l0_area: z.string().optional(),
    l1_process: z.string().optional(),
    l2_subprocess: z.string().nullable().optional(),
    process_owner: z.string().nullable().optional(),
    owning_department: z.string().nullable().optional(),
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
});

export const processPendingCreationCapabilitiesSchema = passthroughObject({
    can_view_diff: z.boolean(),
    can_cancel: z.boolean(),
    is_requester: z.boolean(),
    can_resolve: z.boolean(),
});

export const processPendingCreationSchema: z.ZodType<ProcessPendingCreationRead> = passthroughObject({
    approval_id: z.number(),
    proposal_id: z.string(),
    proposal_version: z.number(),
    status: z.literal('pending_creation'),
    requested_at: z.string(),
    requested_by_name: z.string().nullable(),
    reason: z.string(),
    proposed: processPendingCreationProposalSchema,
    derived: passthroughObject({
        cif: z.enum(['yes', 'no']),
        criticality_class: z.enum(['low', 'medium', 'high', 'critical']).nullable().optional(),
    }),
    capabilities: processPendingCreationCapabilitiesSchema,
});

export const processListCapabilitiesSchema = passthroughObject({
    can_create: z.boolean(),
    can_export: z.boolean(),
});

export const processFacetOptionSchema = passthroughObject({
    value: z.string(),
    label: z.string(),
    count: z.number(),
    disabled: z.boolean(),
    selected: z.boolean(),
});

export const processFacetsSchema = passthroughObject({
    lifecycle: z.array(processFacetOptionSchema).optional(),
    department: z.array(processFacetOptionSchema).optional(),
    owner: z.array(processFacetOptionSchema).optional(),
    l0: z.array(processFacetOptionSchema).optional(),
    criticality: z.array(processFacetOptionSchema).optional(),
    cif: z.array(processFacetOptionSchema).optional(),
    is_complete: z.array(processFacetOptionSchema).optional(),
    licensed_activity: z.array(processFacetOptionSchema).optional(),
    bcm_link: z.array(processFacetOptionSchema).optional(),
    dr_test_result: z.array(processFacetOptionSchema).optional(),
});

export const processLookupOptionSchema = passthroughObject({
    id: z.number(),
    label: z.string(),
    secondary_label: z.string().nullable().optional(),
    disabled: z.boolean(),
    count: z.number().nullable().optional(),
});

export const processOwnerReadSchema = passthroughObject({
    name: z.string(),
    email: z.string(),
    role_name: z.string(),
    department_name: z.string().nullable().optional(),
});

export const processDepartmentReadSchema = passthroughObject({
    name: z.string(),
    code: z.string(),
});

const processCriticalityCodeSchema = z.enum(['low', 'medium', 'high', 'critical']);
const processCifCodeSchema = z.enum(['yes', 'no']);

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
    preliminary_criticality: processCriticalityCodeSchema.nullable().optional(),
    criticality_class_source: z.string(),
    cif_override: processCifCodeSchema.nullable().optional(),
    cif_class_critical: z.boolean(),
    cif_mtpd_within_critical: z.boolean(),
    cif_any_impact_maximal: z.boolean(),
    rto_hours: z.number().nullable().optional(),
    bcm_link: z.enum(['yes', 'no', 'not_assessed', 'not_applicable']).nullable().optional(),
    assessment_date: z.string().nullable().optional(),
    missing_for_completeness: z.array(z.string()),
    manual_vendor_link_count: z.number(),
    transitive_vendor_pair_count: z.number(),
});

/** One derived 11 §2 row (#49): a (Process, Vendor) pair implied via an Asset. */
export const processTransitiveVendorLinkSchema = passthroughObject({
    process_id: z.number(),
    process_name: z.string(),
    process_cif: processCifCodeSchema.nullable().optional(),
    process_criticality: processCriticalityCodeSchema.nullable().optional(),
    vendor_id: z.number(),
    vendor_name: z.string(),
    via_asset_id: z.number(),
    via_asset_name: z.string(),
});

export const processDerivedSchema = passthroughObject({
    criticality_score: z.number().nullable().optional(),
    criticality_class: processCriticalityCodeSchema.nullable().optional(),
    cif: processCifCodeSchema,
    rto_mtpd_check: z.enum(['ok', 'rto_exceeds_mtpd']).nullable().optional(),
    bcm_check: z.enum(['ok', 'cif_without_bcm']),
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

    process_owner_user_id: z.number().nullable().optional(),
    process_owner: processOwnerReadSchema.nullable().optional(),
    owning_department_id: z.number().nullable().optional(),
    owning_department: processDepartmentReadSchema.nullable().optional(),
    owner_orphaned: z.boolean(),
    ownership_status: z.enum([
        'assigned',
        'legacy_unassigned',
        'pending_governance',
        'invalid_assignment',
    ]),

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
    pending_change: processPendingChangeSchema.nullable().optional(),

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
        facets: processFacetsSchema.nullable().optional(),
        pending_creations: z.array(processPendingCreationSchema),
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
    process_name: z.string().nullable().optional(),
    vendor_name: z.string().nullable().optional(),
    process_business_edit_blocked: z.boolean(),
    direct_service_description: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    capabilities: processVendorLinkCapabilitiesSchema.nullable().optional(),
    created_at: z.string(),
});

export const processVendorLinkListSchema = z.array(processVendorLinkSchema);
