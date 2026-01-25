export type VendorStatus = 'active' | 'inactive';

export type VendorType =
    | 'ict'
    | 'outsourcing'
    | 'professional_services'
    | 'partner'
    | 'other';

export type VendorReplaceability = 'easy' | 'medium' | 'hard';

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
}

export type VendorCreate = Omit<Vendor, 'id' | 'department_name' | 'outsourcing_owner_name' | 'created_at' | 'updated_at'>;

export type VendorUpdate = Partial<VendorCreate>;

export interface VendorListResponse {
    items: Vendor[];
    total: number;
    skip: number;
    limit: number;
}

