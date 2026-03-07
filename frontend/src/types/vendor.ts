export type VendorStatus = 'active' | 'inactive';

export type VendorType =
    | 'ict'
    | 'outsourcing'
    | 'professional_services'
    | 'partner'
    | 'other';

export type VendorReplaceability = 'easy' | 'medium' | 'hard';

export interface VendorLinkedRiskSummary {
    risk_id: number;
    risk_id_code: string;
    risk_name: string;
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

    vendor_type: VendorType;
    risk_score_1_5: number;
    supports_important_core_insurance_function: boolean;
    dora_relevant: boolean;
    is_significant_vendor: boolean;
    materiality_assessed_max_impact_pct_own_funds?: number | null;
    replaceability?: VendorReplaceability | null;
    has_alternative_providers: boolean;

    status: VendorStatus;

    created_at: string;
    updated_at: string;

    reassessment_cadence_months: number;
    next_reassessment_due_at?: string | null;
    last_assessed_at?: string | null;
    last_decided_at?: string | null;
    last_reassessment_reminded_at?: string | null;
    reassessment_triggered_reason?: string | null;
    reassessment_triggered_at?: string | null;
}

export type VendorCreate = Omit<
    Vendor,
    | 'id'
    | 'department_name'
    | 'outsourcing_owner_name'
    | 'created_at'
    | 'updated_at'
    | 'reassessment_cadence_months'
    | 'next_reassessment_due_at'
    | 'last_assessed_at'
    | 'last_decided_at'
    | 'last_reassessment_reminded_at'
    | 'reassessment_triggered_reason'
    | 'reassessment_triggered_at'
>;

export type VendorUpdate = Partial<VendorCreate>;

export interface VendorListResponse {
    items: Vendor[];
    total: number;
    skip: number;
    limit: number;
}

export interface VendorListParams {
    skip?: number;
    limit?: number;
    search?: string;
    status?: VendorStatus;
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
    sort_by?: 'name' | 'status' | 'vendor_type' | 'risk_score_1_5' | 'process' | 'created_at';
    sort_order?: 'asc' | 'desc';
}
