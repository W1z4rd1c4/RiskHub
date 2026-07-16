import type { Vendor, VendorLinkedRiskSummary, VendorListResponse } from '@/types/vendor';
import type { VendorContract } from '@/types/vendorContract';
import type { LinkedVendorSummary } from '@/types/vendorLink';
import type { VendorSubOutsourcing } from '@/types/vendorSubOutsourcing';
import { VENDOR_CONTROLLED_CODES } from '@/lib/vendorValues';

import { collectionPaginationSchema, passthroughObject, z } from '../common';

export const linkedVendorSummarySchema: z.ZodType<LinkedVendorSummary> = passthroughObject({
    id: z.number(),
    name: z.string(),
    is_archived: z.boolean().optional(),
});
export const linkedVendorSummaryArraySchema = z.array(linkedVendorSummarySchema);

export const vendorLinkedRiskSummarySchema: z.ZodType<VendorLinkedRiskSummary> =
    passthroughObject({
        risk_id: z.number(),
        risk_id_code: z.string(),
        risk_name: z.string(),
    });

const vendorCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
    can_manage_accountability: z.boolean().default(false),
    can_archive: z.boolean(),
    can_restore: z.boolean(),
    can_create_linked_risk: z.boolean(),
    can_create_linked_control: z.boolean(),
    can_create_linked_kri: z.boolean(),
    can_link_risk: z.boolean(),
    can_link_control: z.boolean(),
    can_link_kri: z.boolean(),
    can_view_linked_risks: z.boolean(),
    can_view_linked_controls: z.boolean(),
    can_view_linked_kris: z.boolean(),
    can_create_issue: z.boolean(),
    can_view_contracts: z.boolean(),
    can_manage_contracts: z.boolean(),
    can_view_sub_outsourcing: z.boolean(),
    can_manage_sub_outsourcing: z.boolean(),
    can_view_asset_links: z.boolean(),
    can_manage_asset_links: z.boolean(),
    can_manage_process_links: z.boolean(),
});

const vendorOwnerSchema = passthroughObject({
    name: z.string(),
    email: z.string(),
    role_name: z.string(),
    department_name: z.string().nullable().optional(),
});

export const vendorContractCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
    can_archive: z.boolean(),
    can_restore: z.boolean(),
});

// Engine-derived blocks (ticket #49): read-only values computed on read,
// each with the explain inputs behind it.
export const vendorTransitiveProcessLinkSchema = passthroughObject({
    process_id: z.number(),
    process_name: z.string(),
    process_cif: z.enum(['yes', 'no', 'unknown']).nullable().optional(),
    process_criticality: z.enum(['low', 'medium', 'high', 'critical', 'unknown']).nullable().optional(),
    vendor_id: z.number(),
    vendor_name: z.string(),
    via_asset_id: z.number(),
    via_asset_name: z.string(),
});

export const vendorDerivedInputsSchema = passthroughObject({
    country: z.enum(VENDOR_CONTROLLED_CODES.country).nullable().optional(),
    substitutability: z.enum(VENDOR_CONTROLLED_CODES.replaceability).nullable().optional(),
    exit_plan_state: z.enum(VENDOR_CONTROLLED_CODES.exit_plan_state).nullable().optional(),
    ex_ante_assessment_date: z.string().nullable().optional(),
    significance_authorization_conditions: z.enum(VENDOR_CONTROLLED_CODES.significance_authorization_conditions).nullable().optional(),
    significance_regulatory_requirements: z.enum(VENDOR_CONTROLLED_CODES.significance_regulatory_requirements).nullable().optional(),
    significance_service_quality: z.enum(VENDOR_CONTROLLED_CODES.significance_service_quality).nullable().optional(),
    significance_financial_impact: z.enum(VENDOR_CONTROLLED_CODES.significance_financial_impact).nullable().optional(),
    significance_reputation_continuity: z.enum(VENDOR_CONTROLLED_CODES.significance_reputation_continuity).nullable().optional(),
    significance_cumulative_impact: z.enum(VENDOR_CONTROLLED_CODES.significance_cumulative_impact).nullable().optional(),
    cif_asset_link_count: z.number(),
    cif_process_link_count: z.number(),
    tier_cif_chain: z.boolean(),
    tier_max_rank_at_least_high: z.boolean(),
    tier_substitutability_match: z.boolean(),
    cloud_service_link_count: z.number(),
    manual_process_link_count: z.number(),
    transitive_process_pair_count: z.number(),
    missing_for_completeness: z.array(z.string()),
});

export const vendorDerivedSchema = passthroughObject({
    country_category: z.enum(['domestic', 'eu', 'non_eu', 'unknown']).nullable().optional(),
    cif: z.enum(['yes', 'no', 'unknown']),
    linked_asset_count: z.number(),
    linked_process_count: z.number(),
    cif_process_count: z.number(),
    h_rank: z.number(),
    max_criticality: z.enum(['low', 'medium', 'high', 'critical', 'unknown']).nullable().optional(),
    tier: z.enum(['critical', 'significant', 'standard', 'unknown']),
    cif_chain: z.enum(['yes', 'no', 'unknown']),
    chain_level: z.enum(['A', 'B', 'C']).nullable().optional(),
    direct_sub_provider_names: z.array(z.string()),
    direct_sub_provider_count: z.number(),
    significance_outcome: z.enum(['yes', 'no', 'unknown']),
    main_contract_reference: z.string().nullable().optional(),
    main_contract_arrangement_type: z.enum(['standalone', 'overarching_master', 'subsequent_associated', 'unknown']).nullable().optional(),
    main_contract_start_date: z.string().nullable().optional(),
    main_contract_end_date: z.string().nullable().optional(),
    contract_count: z.number(),
    main_contract_count: z.number(),
    is_complete: z.boolean(),
    inputs: vendorDerivedInputsSchema,
    transitive_process_links: z.array(vendorTransitiveProcessLinkSchema),
});

export const vendorContractDerivedSchema = passthroughObject({
    vendor_name: z.string(),
    sub_outsourcing_chain: z.string(),
    duplicate_check: z.string(),
    cif: z.string(),
    inputs: passthroughObject({
        vendor_id: z.number(),
        prime_vendor_cif: z.string(),
        reference_duplicate_count: z.number(),
        sub_outsourcing_count: z.number(),
    }),
});

export const vendorSubOutsourcingDerivedSchema = passthroughObject({
    contract_reference: z.string().nullable().optional(),
    contract_vendor_id: z.number().nullable().optional(),
    contract_vendor_name: z.string(),
    rank: z.number().nullable().optional(),
    critical_service: z.string(),
    chain_check: z.string(),
    roi_scope: z.string().nullable().optional(),
    inputs: passthroughObject({
        contract_id: z.number(),
        predecessor_id: z.number().nullable().optional(),
        predecessor_rank: z.number().nullable().optional(),
        is_direct: z.boolean(),
        duplicate_key_count: z.number(),
    }),
});
export const vendorListCapabilitiesSchema = passthroughObject({
    can_export: z.boolean().optional(),
    can_create: z.boolean().optional(),
    can_view_risk_contexts: z.boolean().optional(),
});

export const vendorSchema: z.ZodType<Vendor> = passthroughObject({
    id: z.number(),
    name: z.string(),
    legal_name: z.string().nullable().optional(),
    registration_id: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    process: z.string(),
    subprocess: z.string().nullable().optional(),
    department_id: z.number().nullable().optional(),
    department_name: z.string().nullable().optional(),
    outsourcing_owner_user_id: z.number(),
    outsourcing_owner_name: z.string().nullable().optional(),
    outsourcing_owner: vendorOwnerSchema.nullable().optional(),
    owner_orphaned: z.boolean().default(false),
    ownership_status: z.enum([
        'assigned',
        'legacy_unassigned',
        'pending_governance',
        'invalid_assignment',
    ]).default('legacy_unassigned'),
    linked_risks: z.array(vendorLinkedRiskSummarySchema),
    capabilities: vendorCapabilitiesSchema.nullable().optional(),
    vendor_type: z.enum(['ict', 'outsourcing', 'professional_services', 'partner', 'other']),
    risk_score_1_5: z.number(),
    supports_important_core_insurance_function: z.boolean(),
    dora_relevant: z.boolean(),
    is_significant_vendor: z.boolean(),
    materiality_assessed_max_impact_pct_own_funds: z.number().nullable().optional(),
    // Canonical substitutability codes; legacy labels are normalized at migration/import boundaries.
    replaceability: z.enum(VENDOR_CONTROLLED_CODES.replaceability).nullable().optional(),
    has_alternative_providers: z.boolean(),
    latin_name: z.string().nullable().optional(),
    person_type: z.enum(VENDOR_CONTROLLED_CODES.person_type).nullable().optional(),
    identifier_type: z.enum(VENDOR_CONTROLLED_CODES.identifier_type).nullable().optional(),
    identifier_value: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    contact_person: z.string().nullable().optional(),
    contact: z.string().nullable().optional(),
    ultimate_parent_name: z.string().nullable().optional(),
    ultimate_parent_lei: z.string().nullable().optional(),
    data_storage: z.string().nullable().optional(),
    service_country: z.string().nullable().optional(),
    data_location: z.string().nullable().optional(),
    processing_location: z.string().nullable().optional(),
    data_sensitivity: z.enum(VENDOR_CONTROLLED_CODES.data_sensitivity).nullable().optional(),
    substitutability_reason: z.enum(VENDOR_CONTROLLED_CODES.substitutability_reason).nullable().optional(),
    last_audit_date: z.string().nullable().optional(),
    exit_plan_state: z.enum(VENDOR_CONTROLLED_CODES.exit_plan_state).nullable().optional(),
    reintegration: z.enum(VENDOR_CONTROLLED_CODES.reintegration).nullable().optional(),
    service_disruption_impact: z.enum(VENDOR_CONTROLLED_CODES.service_disruption_impact).nullable().optional(),
    alternative_providers: z.enum(VENDOR_CONTROLLED_CODES.alternative_providers).nullable().optional(),
    alternative_providers_names: z.string().nullable().optional(),
    ctpp_designation: z.enum(VENDOR_CONTROLLED_CODES.ctpp_designation).nullable().optional(),
    ex_ante_operational: z.enum(VENDOR_CONTROLLED_CODES.ex_ante_operational).nullable().optional(),
    ex_ante_legal: z.enum(VENDOR_CONTROLLED_CODES.ex_ante_legal).nullable().optional(),
    ex_ante_ict: z.enum(VENDOR_CONTROLLED_CODES.ex_ante_ict).nullable().optional(),
    ex_ante_reputational: z.enum(VENDOR_CONTROLLED_CODES.ex_ante_reputational).nullable().optional(),
    ex_ante_data_confidentiality: z.enum(VENDOR_CONTROLLED_CODES.ex_ante_data_confidentiality).nullable().optional(),
    ex_ante_data_availability: z.enum(VENDOR_CONTROLLED_CODES.ex_ante_data_availability).nullable().optional(),
    ex_ante_data_location: z.enum(VENDOR_CONTROLLED_CODES.ex_ante_data_location).nullable().optional(),
    ex_ante_provider_location: z.enum(VENDOR_CONTROLLED_CODES.ex_ante_provider_location).nullable().optional(),
    ex_ante_ict_concentration: z.enum(VENDOR_CONTROLLED_CODES.ex_ante_ict_concentration).nullable().optional(),
    ex_ante_assessment_date: z.string().nullable().optional(),
    assessment_phase: z.enum(VENDOR_CONTROLLED_CODES.assessment_phase).nullable().optional(),
    due_diligence_state: z.enum(VENDOR_CONTROLLED_CODES.due_diligence_state).nullable().optional(),
    last_monitoring_date: z.string().nullable().optional(),
    significance_authorization_conditions: z.enum(VENDOR_CONTROLLED_CODES.significance_authorization_conditions).nullable().optional(),
    significance_regulatory_requirements: z.enum(VENDOR_CONTROLLED_CODES.significance_regulatory_requirements).nullable().optional(),
    significance_service_quality: z.enum(VENDOR_CONTROLLED_CODES.significance_service_quality).nullable().optional(),
    significance_financial_impact: z.enum(VENDOR_CONTROLLED_CODES.significance_financial_impact).nullable().optional(),
    significance_reputation_continuity: z.enum(VENDOR_CONTROLLED_CODES.significance_reputation_continuity).nullable().optional(),
    significance_cumulative_impact: z.enum(VENDOR_CONTROLLED_CODES.significance_cumulative_impact).nullable().optional(),
    significance_justification: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    reference_occurrence_count: z.number().nullable().optional(),
    reference_process_count: z.number().nullable().optional(),
    derived: vendorDerivedSchema.nullable().optional(),
    is_archived: z.boolean(),
    archived_at: z.string().nullable().optional(),
    archived_by_id: z.number().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
});

export const vendorContractSchema: z.ZodType<VendorContract> = passthroughObject({
    id: z.number(),
    vendor_id: z.number(),
    contract_reference: z.string().nullable().optional(),
    internal_contract_number: z.string().nullable().optional(),
    records_system: z.string().nullable().optional(),
    arrangement_type: z.string().nullable().optional(),
    main_contract: z.string().nullable().optional(),
    overarching_arrangement_reference: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    roi_scope: z.string().nullable().optional(),
    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),
    notice_period_entity_days: z.number().nullable().optional(),
    notice_period_provider_days: z.number().nullable().optional(),
    governing_law_country: z.string().nullable().optional(),
    annual_cost: z.union([z.number(), z.string()]).nullable().optional(),
    currency: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    derived: vendorContractDerivedSchema.nullable().optional(),
    is_archived: z.boolean(),
    archived_at: z.string().nullable().optional(),
    archived_by_id: z.number().nullable().optional(),
    capabilities: vendorContractCapabilitiesSchema.nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
});

export const vendorContractListSchema = z.array(vendorContractSchema);

export const vendorSubOutsourcingCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
    can_archive: z.boolean(),
    can_restore: z.boolean(),
});

export const vendorSubOutsourcingSchema: z.ZodType<VendorSubOutsourcing> = passthroughObject({
    id: z.number(),
    vendor_id: z.number(),
    contract_id: z.number(),
    predecessor_id: z.number().nullable().optional(),
    sub_provider_name: z.string().nullable().optional(),
    person_type: z.string().nullable().optional(),
    identifier_type: z.string().nullable().optional(),
    identifier_value: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    ict_service_code: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    derived: vendorSubOutsourcingDerivedSchema.nullable().optional(),
    is_archived: z.boolean(),
    archived_at: z.string().nullable().optional(),
    archived_by_id: z.number().nullable().optional(),
    capabilities: vendorSubOutsourcingCapabilitiesSchema.nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
});

export const vendorSubOutsourcingListSchema = z.array(vendorSubOutsourcingSchema);

/** S01-S19 ICT service taxonomy from the ICT Register reference API (issue #41). */
export const ictServiceTaxonomySchema = passthroughObject({
    services: z.array(
        passthroughObject({
            code: z.string(),
            label: z.string(),
        }),
    ),
    cloud_service_codes: z.array(z.string()),
});

export const vendorArraySchema = z.array(vendorSchema);
export const vendorListResponseSchema: z.ZodType<VendorListResponse> =
    collectionPaginationSchema(vendorSchema).extend({
        capabilities: vendorListCapabilitiesSchema.nullable().optional(),
    });
export const vendorReportCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_download_annual_report: z.boolean(),
    can_download_dora_register: z.boolean(),
    can_use_department_filter: z.boolean(),
});
