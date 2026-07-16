import { apiClient } from './apiClient';
import { normalizeCollectionResponse } from './collectionApi';
import {
    approvalCreatedResponseSchema,
    riskControlLinkArraySchema,
    riskControlLinkSchema,
    riskListResponseSchema,
    riskOrApprovalSchema,
    riskSchema,
    vendorArraySchema,
    voidSchema,
} from '@/services/api/schemas';
import type {
    Risk,
    RiskCreate,
    RiskUpdate,
    RiskControlLink,
    ControlEffectiveness,
    RiskListParams,
    RiskListResponse,
} from '@/types/risk';
import type { Vendor } from '@/types/vendor';
import type { ApprovalCreatedResponse } from '@/types/approval';

function compactRiskFilters(params: RiskListParams): Record<string, unknown> {
    return Object.fromEntries(Object.entries({
        department_id: params.department_id,
        lifecycle: params.lifecycle,
        status: params.status,
        risk_type: params.risk_type,
        is_priority: params.is_priority,
        search: params.search,
        has_breach: params.has_breach,
        min_net_score: params.min_net_score,
        process: params.process,
        category: params.category,
        ict_linked: params.ict_linked,
        above_tolerance: params.above_tolerance,
        response: params.response,
        gross_probability: params.gross_probability,
        gross_impact: params.gross_impact,
        gross_band: params.gross_band,
        net_band: params.net_band,
    }).filter(([, value]) => value !== undefined && value !== ''));
}

export function buildRiskCollectionQuery(params: RiskListParams & { skip?: number }): URLSearchParams {
    const query = new URLSearchParams();
    const offset = params.offset ?? params.skip;
    if (offset !== undefined) query.set('offset', String(offset));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    const filters = compactRiskFilters(params);
    if (Object.keys(filters).length > 0) query.set('filters', JSON.stringify(filters));
    const sort = params.sort ?? (params.sort_by ? { field: params.sort_by, direction: params.sort_order ?? 'asc' as const } : null);
    if (sort) query.set('sort', JSON.stringify(sort));
    if (params.group_by) query.set('group_by', params.group_by);
    if (params.group_value) query.set('group_value', params.group_value);
    return query;
}

async function downloadRiskExport(params: RiskListParams, locale: 'en' | 'cs'): Promise<void> {
    const query = buildRiskCollectionQuery(params);
    query.delete('offset');
    query.delete('limit');
    query.set('format', 'csv');
    query.set('locale', locale);
    const { blob, headers } = await apiClient.getBlob(`/risks/export?${query.toString()}`, { timeoutMs: null });
    const match = headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = match?.[1] ?? 'risks.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export const riskApi = {
    async getRisks(params: RiskListParams & { skip?: number }): Promise<RiskListResponse> {
        const response = await apiClient.get('/risks', {
            params: buildRiskCollectionQuery(params),
            schema: riskListResponseSchema,
        });
        return normalizeCollectionResponse(response);
    },

    downloadExport: downloadRiskExport,

    async getRisk(id: number): Promise<Risk> {
        return apiClient.get(`/risks/${id}`, { schema: riskSchema });
    },

    async createRisk(data: RiskCreate): Promise<Risk> {
        return apiClient.post('/risks', data, { schema: riskSchema });
    },

    async updateRisk(id: number, data: RiskUpdate): Promise<Risk | ApprovalCreatedResponse> {
        return apiClient.patch(`/risks/${id}`, data, { schema: riskOrApprovalSchema });
    },

    async deleteRisk(id: number, reason: string = 'Archived by user'): Promise<void | ApprovalCreatedResponse> {
        return apiClient.delete(`/risks/${id}`, {
            params: { reason },
            schema: approvalCreatedResponseSchema.or(voidSchema),
        });
    },

    async restoreRisk(id: number): Promise<Risk> {
        return apiClient.post(`/risks/${id}/restore`, {}, { schema: riskSchema });
    },

    async getLinkedControls(riskId: number): Promise<RiskControlLink[]> {
        return apiClient.get(`/risks/${riskId}/controls`, {
            schema: riskControlLinkArraySchema,
        });
    },

    async linkControl(
        riskId: number,
        data: { control_id: number; effectiveness: ControlEffectiveness; notes?: string }
    ): Promise<RiskControlLink> {
        return apiClient.post(`/risks/${riskId}/controls`, data, {
            schema: riskControlLinkSchema,
        });
    },

    async unlinkControl(riskId: number, controlId: number): Promise<void> {
        return apiClient.delete(`/risks/${riskId}/controls/${controlId}`, { schema: voidSchema });
    },

    async getLinkedVendors(riskId: number): Promise<Vendor[]> {
        return apiClient.get(`/risks/${riskId}/vendors`, { schema: vendorArraySchema });
    },
};
