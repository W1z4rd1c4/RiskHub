/**
 * API service for cross-control execution audit/list flows.
 */

import { apiClient } from './apiClient';
import { executionListResponseSchema } from '@/services/api/schemas';
import type { ExecutionListResponse, ExecutionResult } from '@/types/execution';

export type { ExecutionAuditItem, ExecutionListResponse, ExecutionResult } from '@/types/execution';

export const executionApi = {
    /**
     * Get paginated executions with optional audit filters.
     */
    async getExecutions(params: {
        result?: ExecutionResult;
        from_date?: string;
        to_date?: string;
        skip?: number;
        limit?: number;
    } = {}): Promise<ExecutionListResponse> {
        return apiClient.get('/executions', { params, schema: executionListResponseSchema });
    }
};
