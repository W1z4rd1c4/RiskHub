import { apiClient } from './apiClient';
import type { ApprovalRequest, ApprovalListResponse, CreateApprovalRequest, ResolveApprovalRequest } from '../types/approval';

export const approvalsApi = {
    list: (params?: { status?: string; my_requests?: boolean; skip?: number; limit?: number }) =>
        apiClient.get<ApprovalListResponse>('/approvals', { params }),

    get: (id: number) =>
        apiClient.get<ApprovalRequest>(`/approvals/${id}`),

    create: (data: CreateApprovalRequest) =>
        apiClient.post<ApprovalRequest>('/approvals', data),

    approve: (id: number, data: ResolveApprovalRequest) =>
        apiClient.post<ApprovalRequest>(`/approvals/${id}/approve`, data),

    reject: (id: number, data: ResolveApprovalRequest) =>
        apiClient.post<ApprovalRequest>(`/approvals/${id}/reject`, data),

    cancel: (id: number) =>
        apiClient.post<ApprovalRequest>(`/approvals/${id}/cancel`, {}),

    getPendingCount: () =>
        apiClient.get<{ count: number }>('/approvals/pending/count'),
};
