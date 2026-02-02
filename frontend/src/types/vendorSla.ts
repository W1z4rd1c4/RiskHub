export type VendorSLAFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';

export interface VendorSLA {
    id: number;
    vendor_id: number;
    metric_name: string;
    description: string;
    current_value: number;
    lower_limit: number;
    upper_limit: number;
    unit: string;
    frequency: VendorSLAFrequency;
    reporting_owner_id?: number | null;
    last_period_end?: string | null;
    last_reported_at: string;
    is_archived: boolean;
    archived_at?: string | null;
    archived_by_id?: number | null;
    created_at: string;
    last_updated: string;
    breach_status: 'below' | 'within' | 'above';
}

export interface VendorSLACreate {
    vendor_id: number;
    metric_name: string;
    description: string;
    current_value: number;
    lower_limit: number;
    upper_limit: number;
    unit: string;
    frequency: VendorSLAFrequency;
    reporting_owner_id?: number | null;
}

export type VendorSLAUpdate = Partial<Omit<VendorSLACreate, 'vendor_id'>>;

export interface VendorSLAValueCreate {
    value: number;
    recorded_at?: string | null;
}

export interface VendorSLAHistoryEntry {
    id: number;
    sla_id: number;
    period_start: string;
    period_end: string;
    recorded_at: string;
    recorded_by_id?: number | null;
    value: number;
    lower_limit: number;
    upper_limit: number;
    unit: string;
    breach_status: string;
}

export interface VendorSLAHistoryResponse {
    sla_id: number;
    items: VendorSLAHistoryEntry[];
}

