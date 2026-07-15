export interface ProcessCapabilities {
    can_read: boolean;
    can_update: boolean;
    can_archive: boolean;
    can_restore: boolean;
}

export type ProcessCriticalityCode = 'low' | 'medium' | 'high' | 'critical';
export type ProcessCifCode = 'yes' | 'no';
export type ProcessRtoMtpdCheckCode = 'ok' | 'rto_exceeds_mtpd';
export type ProcessBcmCheckCode = 'ok' | 'cif_without_bcm';

/** The inputs (and parameter values) that produced the derived block. */
export interface ProcessDerivedInputs {
    impact_client?: number | null;
    impact_market_operations?: number | null;
    impact_regulatory?: number | null;
    impact_financial?: number | null;
    mtpd_hours?: number | null;
    mtpd_bonus?: number | null;
    threshold_critical_score: number;
    threshold_high_score: number;
    threshold_medium_score: number;
    mtpd_critical_hours: number;
    mtpd_medium_hours: number;
    preliminary_criticality?: ProcessCriticalityCode | null;
    criticality_class_source: string;
    cif_override?: ProcessCifCode | null;
    cif_class_critical: boolean;
    cif_mtpd_within_critical: boolean;
    cif_any_impact_maximal: boolean;
    rto_hours?: number | null;
    bcm_link?: 'yes' | 'no' | 'not_assessed' | 'not_applicable' | null;
    assessment_date?: string | null;
    missing_for_completeness: string[];
    /** dod_n breakdown (#49): manual §1 pairs + derived §2 triples. */
    manual_vendor_link_count: number;
    transitive_vendor_pair_count: number;
}

/** One derived 11 §2 row: a (Process, Vendor) pair implied via an Asset (#49). */
export interface ProcessTransitiveVendorLink {
    process_id: number;
    process_name: string;
    process_cif?: ProcessCifCode | null;
    process_criticality?: ProcessCriticalityCode | null;
    vendor_id: number;
    vendor_name: string;
    via_asset_id: number;
    via_asset_name: string;
}

/** Engine-derived 03_Procesy values (ticket #48) — read-only, computed on read. */
export interface ProcessDerived {
    criticality_score?: number | null;
    criticality_class?: ProcessCriticalityCode | null;
    cif: ProcessCifCode;
    rto_mtpd_check?: ProcessRtoMtpdCheckCode | null;
    bcm_check: ProcessBcmCheckCode;
    next_review_date?: string | null;
    linked_asset_count: number;
    linked_vendor_count: number;
    is_complete: boolean;
    is_duplicate: boolean;
    inputs: ProcessDerivedInputs;
    /** Derived-only §2 rows for this Process — never persisted (#49). */
    transitive_vendor_links: ProcessTransitiveVendorLink[];
}

export interface ProcessListCapabilities {
    can_create?: boolean;
}

export interface ProcessOwnerRead {
    name: string;
    email: string;
    role_name: string;
    department_name?: string | null;
}

export interface ProcessDepartmentRead {
    name: string;
    code: string;
}

export type ProcessOwnershipStatus =
    | 'assigned'
    | 'legacy_unassigned'
    | 'pending_governance'
    | 'invalid_assignment';

export interface Process {
    id: number;
    f_code: string;

    l0_area: string;
    l1_process: string;
    l2_subprocess?: string | null;

    process_owner_user_id?: number | null;
    process_owner?: ProcessOwnerRead | null;
    owning_department_id?: number | null;
    owning_department?: ProcessDepartmentRead | null;
    owner_orphaned: boolean;
    ownership_status: ProcessOwnershipStatus;

    impact_client?: number | null;
    impact_market_operations?: number | null;
    impact_regulatory?: number | null;
    impact_financial?: number | null;
    impact_reputational?: number | null;
    mtpd_hours?: number | null;

    preliminary_criticality?: string | null;
    cif_override?: string | null;

    licensed_activity?: string | null;

    rto_hours?: number | null;
    rpo_hours?: number | null;
    bcm_link?: string | null;
    last_dr_test_date?: string | null;
    dr_test_result?: string | null;

    interruption_impact?: string | null;
    assessment_date?: string | null;
    notes?: string | null;

    derived?: ProcessDerived | null;

    is_archived: boolean;
    archived_at?: string | null;
    archived_by_id?: number | null;
    capabilities?: ProcessCapabilities | null;
    created_at: string;
    updated_at: string;
}

export interface ProcessWritePayload {
    l0_area?: string;
    l1_process?: string;
    l2_subprocess?: string | null;
    process_owner_user_id?: number | null;
    owning_department_id?: number | null;
    impact_client?: number | null;
    impact_market_operations?: number | null;
    impact_regulatory?: number | null;
    impact_financial?: number | null;
    impact_reputational?: number | null;
    mtpd_hours?: number | null;
    preliminary_criticality?: string | null;
    cif_override?: string | null;
    licensed_activity?: string | null;
    rto_hours?: number | null;
    rpo_hours?: number | null;
    bcm_link?: string | null;
    last_dr_test_date?: string | null;
    dr_test_result?: string | null;
    interruption_impact?: string | null;
    assessment_date?: string | null;
    notes?: string | null;
}

export interface ProcessListParams {
    offset: number;
    limit: number;
    search?: string;
    include_archived?: boolean;
    sort_by?: ProcessSortField;
    sort_order?: 'asc' | 'desc';
    cif?: boolean;
}

export type ProcessSortField = 'f_code' | 'l0_area' | 'l1_process' | 'owner' | 'created_at';

export interface ProcessListResponse {
    items: Process[];
    total: number;
    offset: number;
    limit: number;
    capabilities?: ProcessListCapabilities | null;
}

export interface ProcessVendorLinkCapabilities {
    /** Mutations follow the REGISTER end: processes:write (plus both reads). */
    can_delete: boolean;
}

/** Process<->Vendor Link relation (workbook sheet 11 §1, the manual set). */
export interface ProcessVendorLink {
    id: number;
    process_id: number;
    vendor_id: number;
    /** Server-resolved display names (FRONTEND_DISPLAY_GUARDRAILS: no raw-id fallbacks). */
    process_name?: string | null;
    vendor_name?: string | null;
    direct_service_description?: string | null;
    note?: string | null;
    capabilities?: ProcessVendorLinkCapabilities | null;
    created_at: string;
}

export interface ProcessVendorLinkCreatePayload {
    vendor_id: number;
    direct_service_description?: string | null;
    note?: string | null;
}
