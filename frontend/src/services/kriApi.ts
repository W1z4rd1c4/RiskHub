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
    KRIListParams,
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

function compactKriFilters(params: KRIListParams): Record<string, string | number | boolean | undefined> {
    return {
        risk_id: params.risk_id,
        breach_only: params.breach_only,
        include_archived: params.include_archived,
        is_archived: params.is_archived,
        lifecycle: params.lifecycle,
        search: params.search,
        monitoring_status: params.monitoring_status,
        timeliness_status: params.timeliness_status,
        frequency: params.frequency,
        department_id: params.department_id,
        reporting_owner_id: params.reporting_owner_id,
    };
}

export function buildKriCollectionQuery(params: KRIListParams = {}): URLSearchParams {
    const built = buildCollectionParams({
        offset: legacyPageToOffset(params, DEFAULT_KRI_LEGACY_PAGE_SIZE),
        limit: params.limit ?? params.size,
        filters: compactKriFilters(params),
        sort: params.sort ?? (params.sort_by
            ? { field: params.sort_by, direction: params.sort_order ?? 'asc' }
            : null),
        groupBy: params.group_by,
        groupValue: params.group_value,
    });
    const query = new URLSearchParams();
    Object.entries(built).forEach(([key, value]) => query.set(key, String(value)));
    return query;
}

async function downloadKriExport(params: KRIListParams, locale: 'en' | 'cs'): Promise<void> {
    const query = buildKriCollectionQuery(params);
    query.delete('offset');
    query.delete('limit');
    query.set('format', 'csv');
    query.set('locale', locale);
    const { blob, headers } = await apiClient.getBlob(`/kris/export?${query.toString()}`, { timeoutMs: null });
    const match = headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = match?.[1] ?? 'kris.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export const kriApi = {
    async getKRIs(params: KRIListParams = {}): Promise<KRIListResponse> {
        const response = await apiClient.get('/kris', {
            params: buildKriCollectionQuery(params),
            schema: kriListResponseSchema,
        });
        return normalizeCollectionResponse(response);
    },

    downloadExport: downloadKriExport,

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
