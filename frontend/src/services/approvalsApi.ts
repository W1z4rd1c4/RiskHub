import { apiClient } from './apiClient';
import {
    approvalListResponseSchema,
    approvalRequestSchema,
    countSchema,
} from '@/services/api/schemas';
import type { CreateApprovalRequest, ResolveApprovalRequest } from '../types/approval';

export const approvalsApi = {
    list: (params?: { status?: string; my_requests?: boolean; skip?: number; limit?: number }) =>
        apiClient.get('/approvals', { params, schema: approvalListResponseSchema }),

    get: (id: number) =>
        apiClient.get(`/approvals/${id}`, { schema: approvalRequestSchema }),

    create: (data: CreateApprovalRequest) =>
        apiClient.post('/approvals', data, { schema: approvalRequestSchema }),

    approve: (id: number, data: ResolveApprovalRequest) =>
        apiClient.post(`/approvals/${id}/approve`, data, { schema: approvalRequestSchema }),

    reject: (id: number, data: ResolveApprovalRequest) =>
        apiClient.post(`/approvals/${id}/reject`, data, { schema: approvalRequestSchema }),

    cancel: (id: number) =>
        apiClient.post(`/approvals/${id}/cancel`, {}, { schema: approvalRequestSchema }),

    getPendingCount: () =>
        apiClient.get('/approvals/pending/count', { schema: countSchema }),
};
