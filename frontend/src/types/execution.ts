export type ExecutionResult = 'passed' | 'failed' | 'warning' | 'not_applicable';

export const ExecutionResult = {
    PASSED: 'passed' as ExecutionResult,
    FAILED: 'failed' as ExecutionResult,
    WARNING: 'warning' as ExecutionResult,
    NA: 'not_applicable' as ExecutionResult,
};

export interface ExecutionActor {
    id: number;
    name: string;
    email?: string | null;
}

export interface ExecutionControlRef {
    id: number;
    name: string;
}

export interface ControlExecutionCreate {
    result: ExecutionResult;
    findings?: string;
    evidence_reference?: string;
    notes?: string;
    next_scheduled?: string;
}

export interface ExecutionCreateRequest extends ControlExecutionCreate {
    control_id: number;
}

export interface ControlExecution {
    id: number;
    control_id: number;
    executed_by_id: number;
    executed_at: string;
    result: ExecutionResult;
    findings?: string | null;
    evidence_reference?: string | null;
    notes?: string | null;
    next_scheduled?: string | null;
    created_at: string;
    executed_by?: ExecutionActor | null;
}

export interface ExecutionAuditItem extends ControlExecution {
    control?: ExecutionControlRef;
    control_name?: string;
    executed_by_name?: string;
    control_owner_name?: string;
    linked_risks?: string[];
}

export interface ExecutionListCapabilities {
    can_export_csv?: boolean;
}

export interface ExecutionListResponse {
    items: ExecutionAuditItem[];
    total: number;
    skip: number;
    limit: number;
    capabilities?: ExecutionListCapabilities | null;
}
