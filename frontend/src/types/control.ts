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

export type ExecutionResult = 'passed' | 'failed' | 'warning' | 'not_applicable';
export const ExecutionResult = {
    PASSED: 'passed' as ExecutionResult,
    FAILED: 'failed' as ExecutionResult,
    WARNING: 'warning' as ExecutionResult,
    NA: 'not_applicable' as ExecutionResult,
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
    data_source?: string;
    methodology_reference?: string;
    control_form: ControlForm;
    process_owner_position?: string;
    control_owner_id?: number;
    executor_position?: string;
    frequency: ControlFrequency;
    risk_level: number;
    output_description?: string;
    report_recipient?: string;
    documentation_location?: string;
    department_id?: number;
    status: ControlStatus;
    created_by_id?: number;
    updated_by_id?: number;
    created_at: string;
    updated_at: string;

    // Relationships
    control_owner?: {
        id: number;
        name: string;
        email: string;
    };
    department?: {
        id: number;
        name: string;
        code: string;
    };
}

export interface ControlSummary extends ControlMonitoringFields {
    id: number;
    name: string;
    description?: string;
    department_id?: number;
    department_name?: string;
    frequency: ControlFrequency;
    risk_level: number;
    status: ControlStatus;
    control_form: ControlForm;
    control_owner_name?: string;
    risk_type?: string;
    risk_id_code?: string;
    risk_name?: string;
    risk_description?: string;
    risk_owner_name?: string;
    risk_department_name?: string;
}

export type ControlCreate = Omit<Control, 'id' | 'created_at' | 'updated_at' | 'control_owner' | 'department'>;

export type ControlUpdate = Partial<ControlCreate>;

export interface ControlExecution {
    id: number;
    control_id: number;
    executed_by_id: number;
    executed_at: string;
    result: ExecutionResult;
    findings?: string;
    evidence_reference?: string;
    notes?: string;
    next_scheduled?: string;
    created_at: string;
    executed_by?: {
        id: number;
        name: string;
        email: string;
    };
}

export interface ControlExecutionCreate {
    result: ExecutionResult;
    findings?: string;
    evidence_reference?: string;
    notes?: string;
}

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
    notes?: string;
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

export interface ControlListResponse {
    items: ControlSummary[];
    total: number;
    skip: number;
    limit: number;
}
