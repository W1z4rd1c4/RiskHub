export type KRIBreachStatus = 'above' | 'below' | 'within';

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
}

export interface KRIUpdate {
    metric_name?: string;
    current_value?: number;
    lower_limit?: number;
    upper_limit?: number;
    unit?: string;
}

export interface KRIListResponse {
    items: KeyRiskIndicator[];
    total: number;
    page: number;
    size: number;
}
