export type VendorStatus = 'active';

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

    status?: VendorStatus; // Optional during pre-migration #77a; removed entirely in #77b.
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

export type VendorListResponse = CollectionListResponse<Vendor>;

export interface VendorListParams {
    offset?: number;
    limit?: number;
    search?: string;
    status?: VendorStatus | 'inactive' | 'archived';
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
    group_by?: string;
    group_value?: string;
}
import type { CollectionListResponse } from '@/types/collection';
