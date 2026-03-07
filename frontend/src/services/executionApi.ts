/**
 * API service for cross-control execution audit/list flows.
 */

import { apiClient } from './apiClient';
import type { ExecutionCreateRequest, ExecutionAuditItem, ExecutionListResponse, ExecutionResult } from '@/types/execution';

export type { ExecutionCreateRequest, ExecutionAuditItem, ExecutionListResponse, ExecutionResult } from '@/types/execution';

export const executionApi = {
    /**
     * Log a new control execution via the generic endpoint.
     */
    async createExecution(execution: ExecutionCreateRequest): Promise<ExecutionAuditItem> {
        return apiClient.post<ExecutionAuditItem>('/executions', execution);
    },

    /**
     * Get paginated executions with optional audit filters.
     */
    async getExecutions(params: {
        control_id?: number;
        result?: ExecutionResult;
        from_date?: string;
        to_date?: string;
        skip?: number;
        limit?: number;
    } = {}): Promise<ExecutionListResponse> {
        return apiClient.get<ExecutionListResponse>('/executions', { params });
    }
};
