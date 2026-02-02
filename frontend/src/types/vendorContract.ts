export type VendorContractControlStatus = 'met' | 'partial' | 'missing' | 'n_a';

export interface VendorContractControlItem {
    template_key: string;
    control_key: string;
    title_key: string;
    description_key?: string | null;

    applies: boolean;
    status: VendorContractControlStatus;

    evidence_reference?: string | null;
    notes?: string | null;
    last_reviewed_at?: string | null;
    reviewed_by_user_id?: number | null;
}

export interface VendorContractControlTemplate {
    template_key: string;
    items: VendorContractControlItem[];
}

export interface VendorContractControlsResponse {
    vendor_id: number;
    templates: VendorContractControlTemplate[];
}

export interface VendorContractControlUpdate {
    control_key: string;
    status: VendorContractControlStatus;
    evidence_reference?: string | null;
    notes?: string | null;
}

