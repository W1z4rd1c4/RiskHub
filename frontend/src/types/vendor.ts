import type { CollectionListResponse } from '@/types/collection';
import type { VendorControlledCode } from '@/lib/vendorValues';

export type VendorType =
    | 'ict'
    | 'outsourcing'
    | 'professional_services'
    | 'partner'
    | 'other';

/** Locale-independent Vendor substitutability codes accepted by the API. */
export type VendorReplaceability =
    | 'not_substitutable'
    | 'highly_complex'
    | 'medium_complexity'
    | 'easily_substitutable';

export interface VendorLinkedRiskSummary {
    risk_id: number;
    risk_id_code: string;
    risk_name: string;
}

export interface VendorCapabilities {
    can_read: boolean;
    can_update: boolean;
    can_manage_accountability: boolean;
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
    can_view_asset_links: boolean;
    can_manage_asset_links: boolean;
    can_manage_process_links: boolean;
}

export interface VendorOwnerRead {
    name: string;
    email: string;
    role_name: string;
    department_name?: string | null;
}

export type VendorOwnershipStatus =
    | 'assigned'
    | 'legacy_unassigned'
    | 'pending_governance'
    | 'invalid_assignment';

/** One derived 11 §2 row: a (Process, Vendor) pair implied via an Asset (#49). */
export interface VendorTransitiveProcessLink {
    process_id: number;
    process_name: string;
    process_cif?: string | null;
    process_criticality?: string | null;
    vendor_id: number;
    vendor_name: string;
    via_asset_id: number;
    via_asset_name: string;
}

/** The inputs, link tallies, and triggers behind the derived block. */
export interface VendorDerivedInputs {
    country?: VendorControlledCode<'country'> | null;
    substitutability?: VendorControlledCode<'replaceability'> | null;
    exit_plan_state?: VendorControlledCode<'exit_plan_state'> | null;
    ex_ante_assessment_date?: string | null;
    significance_authorization_conditions?: VendorControlledCode<'significance_authorization_conditions'> | null;
    significance_regulatory_requirements?: VendorControlledCode<'significance_regulatory_requirements'> | null;
    significance_service_quality?: VendorControlledCode<'significance_service_quality'> | null;
    significance_financial_impact?: VendorControlledCode<'significance_financial_impact'> | null;
    significance_reputation_continuity?: VendorControlledCode<'significance_reputation_continuity'> | null;
    significance_cumulative_impact?: VendorControlledCode<'significance_cumulative_impact'> | null;
    cif_asset_link_count: number;
    cif_process_link_count: number;
    tier_cif_chain: boolean;
    tier_max_rank_at_least_high: boolean;
    tier_substitutability_match: boolean;
    cloud_service_link_count: number;
    manual_process_link_count: number;
    transitive_process_pair_count: number;
    missing_for_completeness: string[];
}

/** Engine-derived 07_Dodavatelé values (ticket #49) — read-only, computed on read. */
export interface VendorDerived {
    country_category?: string | null;
    cif: string;
    linked_asset_count: number;
    linked_process_count: number;
    cif_process_count: number;
    h_rank: number;
    max_criticality?: string | null;
    tier: string;
    cif_chain: string;
    chain_level?: string | null;
    direct_sub_provider_names: string[];
    direct_sub_provider_count: number;
    significance_outcome: string;
    main_contract_reference?: string | null;
    main_contract_arrangement_type?: string | null;
    main_contract_start_date?: string | null;
    main_contract_end_date?: string | null;
    contract_count: number;
    main_contract_count: number;
    is_complete: boolean;
    inputs: VendorDerivedInputs;
    transitive_process_links: VendorTransitiveProcessLink[];
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
    outsourcing_owner?: VendorOwnerRead | null;
    owner_orphaned: boolean;
    ownership_status: VendorOwnershipStatus;
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

    // Engine-derived block (ticket #49): read-only, rejected on write.
    derived?: VendorDerived | null;

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
    | 'outsourcing_owner'
    | 'owner_orphaned'
    | 'ownership_status'
    | 'derived'
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

export interface VendorFacetOption {
    value: string;
    label: string;
    count: number;
    disabled: boolean;
    selected: boolean;
}

export type VendorFacetKey =
    | 'lifecycle'
    | 'department'
    | 'outsourcing_owner'
    | 'vendor_type'
    | 'risk_score'
    | 'tier'
    | 'dora_relevant'
    | 'cif'
    | 'is_significant_vendor'
    | 'substitutability'
    | 'country'
    | 'country_category'
    | 'has_roi_contract'
    | 'has_sub_outsourcing'
    | 'has_direct_process_link';

export type VendorFacets = Partial<Record<VendorFacetKey, VendorFacetOption[]>>;

export interface VendorLookupOption {
    id: number;
    label: string;
    secondary_label?: string | null;
    disabled: boolean;
    count?: number | null;
}

export type VendorListResponse = CollectionListResponse<Vendor, VendorListCapabilities> & {
    facets?: VendorFacets | null;
};

export type VendorRegisterView = 'all' | 'department' | 'process' | 'type' | 'risk' | 'flag';
export type VendorGroupBy = Exclude<VendorRegisterView, 'all'>;
export type VendorSortField =
    | 'name'
    | 'legal_name'
    | 'registration_id'
    | 'department'
    | 'outsourcing_owner'
    | 'vendor_type'
    | 'risk_score'
    | 'tier'
    | 'cif'
    | 'process'
    | 'country'
    | 'created_at';

export interface VendorListParams {
    offset?: number;
    limit?: number;
    search?: string;
    include_archived?: boolean;
    lifecycle?: Array<'active' | 'archived'>;
    sort?: { field: string; direction: 'asc' | 'desc' };
    view?: VendorRegisterView;
    group_by?: VendorGroupBy;
    group_value?: string;
    department_ids?: number[];
    outsourcing_owner_ids?: number[];
    vendor_types?: VendorType[];
    risk_scores?: number[];
    tiers?: string[];
    cif?: boolean;
    substitutability?: string[];
    countries?: string[];
    country_categories?: string[];
    linked_process_ids?: number[];
    linked_asset_ids?: number[];
    linked_risk_ids?: number[];
    linked_control_ids?: number[];
    linked_kri_ids?: number[];
    sort_by?: VendorSortField;
    sort_order?: 'asc' | 'desc';
    has_direct_process_link?: boolean;
    has_roi_contract?: boolean;
    has_sub_outsourcing?: boolean;

    // Compatibility scalars retained by the API during the shared-register migration.
    vendor_type?: VendorType;
    dora_relevant?: boolean;
    supports_important_core_insurance_function?: boolean;
    is_significant_vendor?: boolean;
    outsourcing_owner_user_id?: number;
    department_id?: number;
    process?: string;
    subprocess?: string;
    risk_score_1_5?: number;
    tier?: string;
}
