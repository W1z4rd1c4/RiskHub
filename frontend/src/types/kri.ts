export type KRIBreachStatus = 'above' | 'below' | 'within';

export const KRIFrequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'annually'] as const;
export type KRIFrequency = typeof KRIFrequencies[number];

export interface KeyRiskIndicator {
    id: number;
    risk_id: number;
    metric_name: string;
    current_value: number;
    lower_limit: number;
    upper_limit: number;
    unit: string;
    breach_status: KRIBreachStatus;
    last_updated: string;
    created_at: string;
    // Historization fields
    frequency: KRIFrequency;
    reporting_owner_id?: number;
    reporting_owner_name?: string;
    last_period_end?: string;
    last_reported_at?: string;
    // Grouping metadata
    risk_category?: string;
    risk_process?: string;
    risk_description?: string;
    department_name?: string;
}

export interface KRICreate {
    risk_id: number;
    metric_name: string;
    current_value: number;
    lower_limit: number;
    upper_limit: number;
    unit?: string;
    frequency?: KRIFrequency;
    reporting_owner_id?: number;
}

export interface KRIUpdate {
    metric_name?: string;
    current_value?: number;
    lower_limit?: number;
    upper_limit?: number;
    unit?: string;
    frequency?: KRIFrequency;
    reporting_owner_id?: number;
}

export interface KRIListResponse {
    items: KeyRiskIndicator[];
    total: number;
    page: number;
    size: number;
}

// History types
export interface KRIHistoryEntry {
    id: number;
    kri_id: number;
    period_start: string;
    period_end: string;
    recorded_at: string;
    value: number;
    lower_limit: number;
    upper_limit: number;
    unit: string;
    breach_status: string;
    recorded_by_id?: number;
    recorded_by_name?: string;
}

export interface KRIHistoryListResponse {
    items: KRIHistoryEntry[];
    total: number;
    page: number;
    size: number;
}

export interface KRIRecordValue {
    value: number;
    recorded_at?: string;
    period_end?: string;  // For privileged backdating
}

export interface KRIHistoryEdit {
    value: number;
    reason: string;
}

// Overdue KRI for dashboard
export interface OverdueKRI {
    kri_id: number;
    metric_name: string;
    frequency: string;
    period_end: string;
    due_date: string;
    days_overdue: number;
    reporting_owner_id?: number;
    reporting_owner_name?: string;
    risk_id: number;
}

// Due soon KRI for CRO dashboard (upcoming deadlines)
export interface DueSoonKRI {
    kri_id: number;
    metric_name: string;
    frequency: string;
    period_end: string;
    due_date: string;
    days_until_due: number;
    reporting_owner_id?: number;
    reporting_owner_name?: string;
    risk_id: number;
}

