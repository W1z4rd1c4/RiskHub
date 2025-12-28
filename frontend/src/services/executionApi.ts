/**
 * API service for control executions.
 */

export type ExecutionResult = 'pass' | 'fail' | 'issues_found' | 'not_applicable';

export interface ControlExecutionCreate {
    control_id: number;
    result: ExecutionResult;
    findings?: string;
    evidence_reference?: string;
    notes?: string;
    next_scheduled?: string; // ISO date string
}

export interface ControlExecution {
    id: number;
    control_id: number;
    result: ExecutionResult;
    findings?: string;
    evidence_reference?: string;
    notes?: string;
    next_scheduled?: string;
    executed_by_id: number;
    executed_at: string;
    created_at: string;
    // Nested data from backend
    executed_by?: {
        id: number;
        name: string;
        email?: string;
    };
    control?: {
        id: number;
        name: string;
    };
}

import { apiClient } from './apiClient';

export const executionApi = {
    /**
     * Log a new control execution.
     */
    async createExecution(execution: ControlExecutionCreate): Promise<ControlExecution> {
        return apiClient.post<ControlExecution>('/executions', execution);
    },

    /**
     * Get executions with optional filters.
     */
    async getExecutions(params: {
        control_id?: number;
        result?: ExecutionResult;
        from_date?: string;
        to_date?: string;
        skip?: number;
        limit?: number;
    } = {}): Promise<ControlExecution[]> {
        return apiClient.get<ControlExecution[]>('/executions', { params });
    }
};
