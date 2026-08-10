import { apiClient } from './apiClient';
import { normalizeCollectionResponse } from './collectionApi';
import {
    approvalCreatedResponseSchema,
    controlExecutionArraySchema,
    controlExecutionSchema,
    controlListResponseSchema,
    controlOrApprovalSchema,
    controlRiskLinkArraySchema,
    controlRiskLinkSchema,
    controlSchema,
    voidSchema,
} from '@/services/api/schemas';
import type {
    Control,
    ControlCreate,
    ControlUpdate,
    ControlRiskLink,
    ControlListParams,
    ControlListResponse,
} from '@/types/control';
import type { ControlEffectiveness } from '@/types/risk';
import type { ApprovalCreatedResponse } from '@/types/approval';
import type { ControlExecution, ControlExecutionCreate } from '@/types/execution';

function compactControlFilters(params: ControlListParams): Record<string, unknown> {
    return Object.fromEntries(Object.entries({
        department_id: params.department_id,
        lifecycle: params.lifecycle,
        status: params.status,
        search: params.search,
        process: params.process,
        category: params.category,
        monitoring_status: params.monitoring_status,
    }).filter(([, value]) => value !== undefined && value !== ''));
}

export function buildControlCollectionQuery(params: ControlListParams & { skip?: number }): URLSearchParams {
    const query = new URLSearchParams();
    const offset = params.offset ?? params.skip;
    if (offset !== undefined) query.set('offset', String(offset));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    const filters = compactControlFilters(params);
    if (Object.keys(filters).length > 0) query.set('filters', JSON.stringify(filters));
    const sort = params.sort ?? (params.sort_by ? { field: params.sort_by, direction: params.sort_order ?? 'asc' as const } : null);
    if (sort) query.set('sort', JSON.stringify(sort));
    if (params.group_by) query.set('group_by', params.group_by);
    if (params.group_value) query.set('group_value', params.group_value);
    return query;
}

async function downloadControlExport(params: ControlListParams, locale: 'en' | 'cs'): Promise<void> {
    const query = buildControlCollectionQuery(params);
    query.delete('offset');
    query.delete('limit');
    query.set('format', 'csv');
    query.set('locale', locale);
    const { blob, headers } = await apiClient.getBlob(`/controls/export?${query.toString()}`, { timeoutMs: null });
    const match = headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = match?.[1] ?? 'controls.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export const controlApi = {
    async getControls(params: ControlListParams & { skip?: number }): Promise<ControlListResponse> {
        const response = await apiClient.get('/controls', {
            params: buildControlCollectionQuery(params),
            schema: controlListResponseSchema,
        });
        return normalizeCollectionResponse(response);
    },

    downloadExport: downloadControlExport,

    async getControl(id: number): Promise<Control> {
        return apiClient.get(`/controls/${id}`, { schema: controlSchema });
    },

    async createControl(data: ControlCreate): Promise<Control> {
        return apiClient.post('/controls', data, { schema: controlSchema });
    },

    async updateControl(id: number, data: ControlUpdate): Promise<Control | ApprovalCreatedResponse> {
        return apiClient.patch(`/controls/${id}`, data, { schema: controlOrApprovalSchema });
    },

    async deleteControl(id: number, reason: string = 'Archived by user'): Promise<void | ApprovalCreatedResponse> {
        return apiClient.delete(`/controls/${id}?reason=${encodeURIComponent(reason)}`, {
            schema: approvalCreatedResponseSchema.or(voidSchema),
        });
    },

    async restoreControl(id: number): Promise<Control> {
        return apiClient.post(`/controls/${id}/restore`, {}, { schema: controlSchema });
    },

    async logExecution(controlId: number, data: ControlExecutionCreate): Promise<ControlExecution> {
        return apiClient.post(`/controls/${controlId}/executions`, data, { schema: controlExecutionSchema });
    },

    async getExecutions(controlId: number): Promise<ControlExecution[]> {
        return apiClient.get(`/controls/${controlId}/executions`, { schema: controlExecutionArraySchema });
    },

    async getLinkedRisks(controlId: number): Promise<ControlRiskLink[]> {
        return apiClient.get(`/controls/${controlId}/risks`, { schema: controlRiskLinkArraySchema });
    },

    async linkRisk(
        controlId: number,
        data: { risk_id: number; effectiveness: ControlEffectiveness; notes?: string }
    ): Promise<ControlRiskLink> {
        return apiClient.post(`/controls/${controlId}/risks`, data, { schema: controlRiskLinkSchema });
    },

    async unlinkRisk(controlId: number, riskId: number): Promise<void> {
        return apiClient.delete(`/controls/${controlId}/risks/${riskId}`, { schema: voidSchema });
    }
};
