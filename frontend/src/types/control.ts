export type ControlForm = 'manual' | 'automatic';
export const ControlForm = {
    MANUAL: 'manual' as ControlForm,
    AUTOMATIC: 'automatic' as ControlForm,
};

export type ControlFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'ad_hoc';
export const ControlFrequency = {
    DAILY: 'daily' as ControlFrequency,
    WEEKLY: 'weekly' as ControlFrequency,
    MONTHLY: 'monthly' as ControlFrequency,
    QUARTERLY: 'quarterly' as ControlFrequency,
    ANNUALLY: 'annually' as ControlFrequency,
    AD_HOC: 'ad_hoc' as ControlFrequency,
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

export interface Control {
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

export interface ControlSummary {
    id: number;
    name: string;
    department_id?: number;
    department_name?: string;
    frequency: ControlFrequency;
    risk_level: number;
    status: ControlStatus;
    control_form: ControlForm;
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
    control?: {
        id: number;
        name: string;
    };
    risk?: {
        id: number;
        name: string;
        risk_id_code: string;
        process: string;
        description: string;
    };
}

export interface ControlListResponse {
    items: ControlSummary[];
    total: number;
    skip: number;
    limit: number;
}
