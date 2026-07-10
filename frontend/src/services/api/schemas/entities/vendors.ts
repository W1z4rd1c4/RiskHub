import type { Vendor, VendorLinkedRiskSummary, VendorListResponse } from '@/types/vendor';
import type { VendorContract } from '@/types/vendorContract';
import type { LinkedVendorSummary } from '@/types/vendorLink';
import type { VendorSubOutsourcing } from '@/types/vendorSubOutsourcing';

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
});

export const vendorContractCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
    can_archive: z.boolean(),
    can_restore: z.boolean(),
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
    linked_risks: z.array(vendorLinkedRiskSummarySchema),
    capabilities: vendorCapabilitiesSchema.nullable().optional(),
    vendor_type: z.enum(['ict', 'outsourcing', 'professional_services', 'partner', 'other']),
    risk_score_1_5: z.number(),
    supports_important_core_insurance_function: z.boolean(),
    dora_relevant: z.boolean(),
    is_significant_vendor: z.boolean(),
    materiality_assessed_max_impact_pct_own_funds: z.number().nullable().optional(),
    // Substituce values on new rows; legacy easy/medium/hard rows stay readable.
    replaceability: z.string().nullable().optional(),
    has_alternative_providers: z.boolean(),
    latin_name: z.string().nullable().optional(),
    person_type: z.string().nullable().optional(),
    identifier_type: z.string().nullable().optional(),
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
    data_sensitivity: z.string().nullable().optional(),
    substitutability_reason: z.string().nullable().optional(),
    last_audit_date: z.string().nullable().optional(),
    exit_plan_state: z.string().nullable().optional(),
    reintegration: z.string().nullable().optional(),
    service_disruption_impact: z.string().nullable().optional(),
    alternative_providers: z.string().nullable().optional(),
    alternative_providers_names: z.string().nullable().optional(),
    ctpp_designation: z.string().nullable().optional(),
    ex_ante_operational: z.string().nullable().optional(),
    ex_ante_legal: z.string().nullable().optional(),
    ex_ante_ict: z.string().nullable().optional(),
    ex_ante_reputational: z.string().nullable().optional(),
    ex_ante_data_confidentiality: z.string().nullable().optional(),
    ex_ante_data_availability: z.string().nullable().optional(),
    ex_ante_data_location: z.string().nullable().optional(),
    ex_ante_provider_location: z.string().nullable().optional(),
    ex_ante_ict_concentration: z.string().nullable().optional(),
    ex_ante_assessment_date: z.string().nullable().optional(),
    assessment_phase: z.string().nullable().optional(),
    due_diligence_state: z.string().nullable().optional(),
    last_monitoring_date: z.string().nullable().optional(),
    significance_authorization_conditions: z.string().nullable().optional(),
    significance_regulatory_requirements: z.string().nullable().optional(),
    significance_service_quality: z.string().nullable().optional(),
    significance_financial_impact: z.string().nullable().optional(),
    significance_reputation_continuity: z.string().nullable().optional(),
    significance_cumulative_impact: z.string().nullable().optional(),
    significance_justification: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    reference_occurrence_count: z.number().nullable().optional(),
    reference_process_count: z.number().nullable().optional(),
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
    identifier_type: z.string().nullable().optional(),
    identifier_value: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    ict_service_code: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
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
