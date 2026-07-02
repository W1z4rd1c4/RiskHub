import { apiClient } from './apiClient';
import { buildCollectionParams, normalizeCollectionResponse } from './collectionApi';
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

const DEFAULT_KRI_LEGACY_PAGE_SIZE = 20;

function legacyPageToOffset(
    params: { offset?: number; limit?: number; page?: number; size?: number } | undefined,
    defaultLimit: number,
): number | undefined {
    if (typeof params?.offset === 'number') {
        return params.offset;
    }
    if (typeof params?.page !== 'number') {
        return undefined;
    }
    return (params.page - 1) * (params.limit ?? params.size ?? defaultLimit);
}

export const kriApi = {
    async getKRIs(params?: {
        risk_id?: number;
        breach_only?: boolean;
        offset?: number;
        limit?: number;
        page?: number;
        size?: number;
        include_archived?: boolean;
        is_archived?: boolean;
        search?: string;
        monitoring_status?: KRIMonitoringStatus;
        timeliness_status?: KRITimelinessStatus;
        group_by?: string;
        group_value?: string;
    }): Promise<KRIListResponse> {
        const offset = legacyPageToOffset(params, DEFAULT_KRI_LEGACY_PAGE_SIZE);
        const response = await apiClient.get('/kris', {
            params: buildCollectionParams({
                offset,
                limit: params?.limit ?? params?.size,
                filters: {
                    risk_id: params?.risk_id,
                    breach_only: params?.breach_only,
                    include_archived: params?.include_archived,
                    is_archived: params?.is_archived,
                    search: params?.search,
                    monitoring_status: params?.monitoring_status,
                    timeliness_status: params?.timeliness_status,
                },
                groupBy: params?.group_by,
                groupValue: params?.group_value,
            }),
            schema: kriListResponseSchema,
        });
        return normalizeCollectionResponse(response);
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
        return apiClient.patch(`/kris/${id}`, data, { schema: keyRiskIndicatorOrApprovalSchema });
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
        params?: {
            from_date?: string;
            to_date?: string;
            offset?: number;
            limit?: number;
            page?: number;
            size?: number;
            include_archived?: boolean;
            sort_by?: 'recorded_at' | 'period';
            sort_direction?: 'desc' | 'asc';
        },
    ): Promise<KRIHistoryListResponse> {
        const offset = legacyPageToOffset(params, DEFAULT_KRI_LEGACY_PAGE_SIZE);
        return apiClient.get(`/kris/${kriId}/history`, {
            params: {
                from_date: params?.from_date,
                to_date: params?.to_date,
                include_archived: params?.include_archived,
                offset,
                limit: params?.limit ?? params?.size,
                sort_by: params?.sort_by,
                sort_direction: params?.sort_direction,
            },
            schema: kriHistoryListResponseSchema,
        });
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
