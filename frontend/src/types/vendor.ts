import type { CollectionListResponse } from '@/types/collection';

export type VendorType =
    | 'ict'
    | 'outsourcing'
    | 'professional_services'
    | 'partner'
    | 'other';

/**
 * The register's Substitutability input: writes are constrained to the
 * workbook's closed four-value Substituce list; rows stored before the ICT
 * Register extension may still carry the legacy easy/medium/hard values.
 */
export type VendorReplaceability = string;

export interface VendorLinkedRiskSummary {
    risk_id: number;
    risk_id_code: string;
    risk_name: string;
}

export interface VendorCapabilities {
    can_read: boolean;
    can_update: boolean;
    can_archive: boolean;
    can_restore: boolean;
    can_create_linked_risk: boolean;
    can_create_linked_control: boolean;
    can_create_linked_kri: boolean;
    can_link_risk: boolean;
    can_link_control: boolean;
    can_link_kri: boolean;
    can_view_linked_risks: boolean;
    can_view_linked_controls: boolean;
    can_view_linked_kris: boolean;
    can_create_issue: boolean;
    can_view_contracts: boolean;
    can_manage_contracts: boolean;
    can_view_sub_outsourcing: boolean;
    can_manage_sub_outsourcing: boolean;
}

export interface Vendor {
    id: number;

    name: string;
    legal_name?: string | null;
    registration_id?: string | null;
    country?: string | null;
    website?: string | null;
    description?: string | null;

    process: string;
    subprocess?: string | null;
    department_id?: number | null;
    department_name?: string | null;

    outsourcing_owner_user_id: number;
    outsourcing_owner_name?: string | null;
    linked_risks: VendorLinkedRiskSummary[];
    capabilities?: VendorCapabilities | null;

    vendor_type: VendorType;
    risk_score_1_5: number;
    supports_important_core_insurance_function: boolean;
    dora_relevant: boolean;
    is_significant_vendor: boolean;
    materiality_assessed_max_impact_pct_own_funds?: number | null;
    replaceability?: VendorReplaceability | null;
    has_alternative_providers: boolean;

    // ICT Register extension (issue #44) — entered 07_Dodavatelé columns.
    latin_name?: string | null;
    person_type?: string | null;
    identifier_type?: string | null;
    identifier_value?: string | null;
    address?: string | null;
    contact_person?: string | null;
    contact?: string | null;
    ultimate_parent_name?: string | null;
    ultimate_parent_lei?: string | null;
    data_storage?: string | null;
    service_country?: string | null;
    data_location?: string | null;
    processing_location?: string | null;
    data_sensitivity?: string | null;
    substitutability_reason?: string | null;
    last_audit_date?: string | null;
    exit_plan_state?: string | null;
    reintegration?: string | null;
    service_disruption_impact?: string | null;
    alternative_providers?: string | null;
    alternative_providers_names?: string | null;
    ctpp_designation?: string | null;
    ex_ante_operational?: string | null;
    ex_ante_legal?: string | null;
    ex_ante_ict?: string | null;
    ex_ante_reputational?: string | null;
    ex_ante_data_confidentiality?: string | null;
    ex_ante_data_availability?: string | null;
    ex_ante_data_location?: string | null;
    ex_ante_provider_location?: string | null;
    ex_ante_ict_concentration?: string | null;
    ex_ante_assessment_date?: string | null;
    assessment_phase?: string | null;
    due_diligence_state?: string | null;
    last_monitoring_date?: string | null;
    significance_authorization_conditions?: string | null;
    significance_regulatory_requirements?: string | null;
    significance_service_quality?: string | null;
    significance_financial_impact?: string | null;
    significance_reputation_continuity?: string | null;
    significance_cumulative_impact?: string | null;
    significance_justification?: string | null;
    note?: string | null;
    reference_occurrence_count?: number | null;
    reference_process_count?: number | null;

    is_archived: boolean;
    archived_at?: string | null;
    archived_by_id?: number | null;

    created_at: string;
    updated_at: string;
}

export type VendorCreate = Omit<
    Vendor,
    | 'id'
    | 'department_name'
    | 'linked_risks'
    | 'outsourcing_owner_name'
    | 'is_archived'
    | 'archived_at'
    | 'archived_by_id'
    | 'created_at'
    | 'updated_at'
>;

export type VendorUpdate = Partial<VendorCreate>;

export interface VendorListCapabilities {
    can_export?: boolean;
    can_create?: boolean;
    can_view_risk_contexts?: boolean;
}

export type VendorListResponse = CollectionListResponse<Vendor, VendorListCapabilities>;

export interface VendorListParams {
    offset?: number;
    limit?: number;
    search?: string;
    include_archived?: boolean;
    vendor_type?: VendorType;
    dora_relevant?: boolean;
    supports_important_core_insurance_function?: boolean;
    is_significant_vendor?: boolean;
    outsourcing_owner_user_id?: number;
    department_id?: number;
    process?: string;
    subprocess?: string;
    risk_score_1_5?: number;
    sort_by?: 'name' | 'vendor_type' | 'risk_score_1_5' | 'process' | 'created_at';
    sort_order?: 'asc' | 'desc';
    group_by?: string;
    group_value?: string;
}
