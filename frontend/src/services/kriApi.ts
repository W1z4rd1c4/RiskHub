import { apiClient } from './apiClient';
import {
    approvalCreatedResponseSchema,
    dueSoonKRIArraySchema,
    keyRiskIndicatorArraySchema,
    keyRiskIndicatorOrApprovalSchema,
    keyRiskIndicatorSchema,
    kriHistoryEntrySchema,
    kriHistoryListResponseSchema,
    kriListResponseSchema,
    overdueKRIArraySchema,
    voidSchema,
} from '@/services/api/schemas';
import type {
    KeyRiskIndicator,
    KRICreate,
    KRIUpdate,
    KRIListResponse,
    KRIHistoryEntry,
    KRIHistoryListResponse,
    KRIRecordValue,
    KRIHistoryEdit,
    KRIMonitoringStatus,
    KRITimelinessStatus,
    OverdueKRI,
    DueSoonKRI,
} from '../types/kri';
import type { ApprovalCreatedResponse } from '../types/approval';
export const kriApi = {
    async getKRIs(params?: {
        risk_id?: number;
        breach_only?: boolean;
        page?: number;
        size?: number;
        include_archived?: boolean;
        search?: string;
        monitoring_status?: KRIMonitoringStatus;
        timeliness_status?: KRITimelinessStatus;
    }): Promise<KRIListResponse> {
        return apiClient.get('/kris', { params, schema: kriListResponseSchema });
    },

    async getBreaches(params?: { department_id?: number; include_archived?: boolean }): Promise<KeyRiskIndicator[]> {
        return apiClient.get('/kris/breaches', { params, schema: keyRiskIndicatorArraySchema });
    },

    async getKRI(id: number, params?: { include_archived?: boolean }): Promise<KeyRiskIndicator> {
        return apiClient.get(`/kris/${id}`, { params, schema: keyRiskIndicatorSchema });
    },

    async createKRI(data: KRICreate): Promise<KeyRiskIndicator> {
        return apiClient.post('/kris', data, { schema: keyRiskIndicatorSchema });
    },

    async updateKRI(id: number, data: KRIUpdate): Promise<KeyRiskIndicator | ApprovalCreatedResponse> {
        return apiClient.put(`/kris/${id}`, data, { schema: keyRiskIndicatorOrApprovalSchema });
    },

    async deleteKRI(id: number, reason: string): Promise<void | ApprovalCreatedResponse> {
        return apiClient.delete(`/kris/${id}`, {
            params: { reason },
            schema: approvalCreatedResponseSchema.or(voidSchema),
        });
    },

    async restoreKRI(id: number): Promise<KeyRiskIndicator> {
        return apiClient.post(`/kris/${id}/restore`, {}, { schema: keyRiskIndicatorSchema });
    },

    // History endpoints
    async recordValue(kriId: number, data: KRIRecordValue): Promise<KeyRiskIndicator | ApprovalCreatedResponse> {
        return apiClient.post(`/kris/${kriId}/values`, data, { schema: keyRiskIndicatorOrApprovalSchema });
    },

    async getHistory(
        kriId: number,
        params?: { from_date?: string; to_date?: string; page?: number; size?: number; include_archived?: boolean }
    ): Promise<KRIHistoryListResponse> {
        return apiClient.get(`/kris/${kriId}/history`, { params, schema: kriHistoryListResponseSchema });
    },

    async requestHistoryEdit(
        kriId: number,
        entryId: number,
        data: KRIHistoryEdit
    ): Promise<KRIHistoryEntry | ApprovalCreatedResponse> {
        return apiClient.patch(`/kris/${kriId}/history/${entryId}`, data, {
            schema: kriHistoryEntrySchema.or(approvalCreatedResponseSchema),
        });
    },

    async getOverdue(params?: { department_id?: number }): Promise<OverdueKRI[]> {
        return apiClient.get('/kris/overdue', { params, schema: overdueKRIArraySchema });
    },

    async getDueSoon(params?: { department_id?: number }): Promise<DueSoonKRI[]> {
        return apiClient.get('/kris/due-soon', { params, schema: dueSoonKRIArraySchema });
    },
};
