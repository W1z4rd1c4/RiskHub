import type { CollectionListResponse } from '@/types/collection';
import type { ExecutionResult } from '@/types/execution';
import type { LinkedVendorSummary } from '@/types/vendorLink';
export { ExecutionResult } from '@/types/execution';

export type ControlForm = 'manual' | 'automatic';
export const ControlForm = {
    MANUAL: 'manual' as ControlForm,
    AUTOMATIC: 'automatic' as ControlForm,
};

export type ControlFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi-annually' | 'annually' | 'ad_hoc' | 'continuous';
export const ControlFrequency = {
    DAILY: 'daily' as ControlFrequency,
    WEEKLY: 'weekly' as ControlFrequency,
    MONTHLY: 'monthly' as ControlFrequency,
    QUARTERLY: 'quarterly' as ControlFrequency,
    SEMI_ANNUALLY: 'semi-annually' as ControlFrequency,
    ANNUALLY: 'annually' as ControlFrequency,
    AD_HOC: 'ad_hoc' as ControlFrequency,
    CONTINUOUS: 'continuous' as ControlFrequency,
};

export type ControlStatus = 'draft' | 'active' | 'inactive' | 'archived';
export const ControlStatus = {
    DRAFT: 'draft' as ControlStatus,
    ACTIVE: 'active' as ControlStatus,
    INACTIVE: 'inactive' as ControlStatus,
    ARCHIVED: 'archived' as ControlStatus,
};

export type ControlMonitoringStatus = 'new' | 'needs_review' | 'failed' | 'passed';
export type ControlMonitoringReason =
    | 'no_execution_logs_recent'
    | 'no_execution_logs_stale'
    | 'latest_execution_stale'
    | 'latest_execution_non_passed'
    | 'latest_execution_passed';

export interface ControlMonitoringFields {
    monitoring_status?: ControlMonitoringStatus;
    monitoring_status_reason?: ControlMonitoringReason;
    latest_execution_result?: ExecutionResult | null;
    latest_executed_at?: string | null;
    days_since_last_execution?: number | null;
    execution_log_count?: number;
}

export interface ControlCapabilities {
    can_log_execution: boolean;
    can_link_risk: boolean;
    can_unlink_risk: boolean;
}

export interface Control {
    monitoring_status?: ControlMonitoringStatus;
    monitoring_status_reason?: ControlMonitoringReason;
    latest_execution_result?: ExecutionResult | null;
    latest_executed_at?: string | null;
    days_since_last_execution?: number | null;
    execution_log_count?: number;
    id: number;
    name: string;
    description: string;
    data_source?: string | null;
    methodology_reference?: string | null;
    control_form: ControlForm;
    process_owner_position?: string | null;
    control_owner_id?: number | null;
    executor_position?: string | null;
    frequency: ControlFrequency;
    risk_level: number;
    output_description?: string | null;
    report_recipient?: string | null;
    documentation_location?: string | null;
    department_id?: number | null;
    status: ControlStatus;
    created_by_id?: number | null;
    updated_by_id?: number | null;
    created_at: string;
    updated_at: string;

    // Relationships
    control_owner?: {
        id: number;
        name: string;
        email: string;
    } | null;
    department?: {
        id: number;
        name: string;
        code: string;
    } | null;
    capabilities?: ControlCapabilities | null;
}

export interface ControlSummary extends ControlMonitoringFields {
    id: number;
    name: string;
    description?: string | null;
    department_id?: number | null;
    department_name?: string | null;
    frequency: ControlFrequency;
    risk_level: number;
    status: ControlStatus;
    control_form: ControlForm;
    control_owner_name?: string | null;
    risk_type?: string | null;
    risk_id_code?: string | null;
    risk_name?: string | null;
    risk_description?: string | null;
    risk_owner_name?: string | null;
    risk_department_name?: string | null;
    linked_vendors?: LinkedVendorSummary[];
    capabilities?: ControlCapabilities | null;
}

export type ControlCreate = Omit<Control, 'id' | 'created_at' | 'updated_at' | 'control_owner' | 'department'>;

export type ControlUpdate = Partial<ControlCreate>;

export type ControlEffectiveness = 'high' | 'medium' | 'low';
export const ControlEffectiveness = {
    HIGH: 'high' as ControlEffectiveness,
    MEDIUM: 'medium' as ControlEffectiveness,
    LOW: 'low' as ControlEffectiveness,
};

export interface ControlRiskLink {
    id: number;
    control_id: number;
    risk_id: number;
    effectiveness: ControlEffectiveness;
    notes?: string | null;
    created_at: string;
    control?: ControlMonitoringFields & {
        id: number;
        name: string;
        frequency?: ControlFrequency | string;
        risk_level?: number;
        status?: ControlStatus | string;
    };
    risk?: {
        id: number;
        name: string;
        risk_id_code: string;
        process: string;
        description: string;
        status?: string;
    };
}

export type ControlListResponse = CollectionListResponse<ControlSummary>;
