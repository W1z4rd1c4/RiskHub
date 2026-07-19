import { apiClient } from './apiClient';
import {
    riskAssetLinkListSchema,
    riskAssetLinkSchema,
    riskProcessLinkListSchema,
    riskProcessLinkSchema,
    processApprovalQueuedResponseSchema,
    threatListResponseSchema,
    threatLookupOptionSchema,
    threatRiskLinkListSchema,
    threatRiskLinkSchema,
    threatSchema,
    voidSchema,
} from '@/services/api/schemas';
import type {
    RiskAssetLink,
    RiskProcessLink,
    Threat,
    ThreatListParams,
    ThreatListResponse,
    ThreatLookupOption,
    ThreatRiskLink,
    ThreatWritePayload,
} from '@/types/threat';
import type { ProcessApprovalQueuedResponse } from '@/types/process';

type ThreatLookupKind = 'stewards' | 'risks' | 'risk-departments';

function appendValues(params: URLSearchParams, key: string, values: ReadonlyArray<string | number> | undefined) {
    values?.forEach((value) => params.append(key, String(value)));
}

export function buildThreatCollectionQuery(params: ThreatListParams): URLSearchParams {
    const query = new URLSearchParams();
    const set = (key: string, value: string | number | boolean | undefined) => {
        if (value !== undefined && value !== '') query.set(key, String(value));
    };
    set('offset', params.offset);
    set('limit', params.limit);
    set('search', params.search);
    set('include_archived', params.include_archived);
    set('sort_by', params.sort_by);
    set('sort_order', params.sort_order);
    if (params.sort) set('sort', JSON.stringify(params.sort));
    set('view', params.view);
    set('group_by', params.group_by);
    set('group_value', params.group_value);
    appendValues(query, 'lifecycle', params.lifecycle);
    appendValues(query, 'categories', params.categories);
    appendValues(query, 'steward_ids', params.steward_ids);
    appendValues(query, 'relevant_subjects', params.relevant_subjects);
    set('has_linked_risk', params.has_linked_risk);
    appendValues(query, 'linked_risk_ids', params.linked_risk_ids);
    appendValues(query, 'linked_risk_types', params.linked_risk_types);
    appendValues(query, 'linked_risk_department_ids', params.linked_risk_department_ids);

    const filterEntries: Array<[string, unknown]> = [
        ['search', params.search],
        ['include_archived', params.include_archived],
        ['lifecycle', params.lifecycle],
        ['categories', params.categories],
        ['steward_ids', params.steward_ids],
        ['relevant_subjects', params.relevant_subjects],
        ['has_linked_risk', params.has_linked_risk],
        ['linked_risk_ids', params.linked_risk_ids],
        ['linked_risk_types', params.linked_risk_types],
        ['linked_risk_department_ids', params.linked_risk_department_ids],
    ];
    const filters = Object.fromEntries(filterEntries.filter(([, value]) => (
        value !== undefined && (!Array.isArray(value) || value.length > 0)
    )));
    if (Object.keys(filters).length > 0) set('filters', JSON.stringify(filters));
    return query;
}

async function downloadThreatExport(params: ThreatListParams, locale: 'en' | 'cs'): Promise<void> {
    const query = buildThreatCollectionQuery(params);
    query.delete('offset');
    query.delete('limit');
    query.set('format', 'csv');
    query.set('locale', locale);
    const { blob, headers } = await apiClient.getBlob(`/threats/export?${query.toString()}`, { timeoutMs: null });
    const match = headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = match?.[1] ?? 'threats.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export const threatApi = {
    async getThreats(params: ThreatListParams): Promise<ThreatListResponse> {
        return apiClient.get('/threats', {
            params: buildThreatCollectionQuery(params),
            schema: threatListResponseSchema,
        });
    },

    async getLookupOptions(
        kind: ThreatLookupKind,
        options: { search?: string; selectedIds?: number[]; limit?: number } = {},
    ): Promise<ThreatLookupOption[]> {
        return apiClient.get(`/threats/lookups/${kind}`, {
            params: {
                search: options.search,
                selected_ids: options.selectedIds,
                limit: options.limit ?? 50,
            },
            schema: threatLookupOptionSchema.array(),
        });
    },

    downloadExport: downloadThreatExport,

    async getThreat(id: number): Promise<Threat> {
        return apiClient.get(`/threats/${id}`, { schema: threatSchema });
    },

    async createThreat(data: ThreatWritePayload): Promise<Threat> {
        return apiClient.post('/threats', data, { schema: threatSchema });
    },

    async updateThreat(id: number, data: ThreatWritePayload): Promise<Threat> {
        return apiClient.patch(`/threats/${id}`, data, { schema: threatSchema });
    },

    async archiveThreat(id: number): Promise<void> {
        return apiClient.delete(`/threats/${id}`, { schema: voidSchema });
    },

    async restoreThreat(id: number): Promise<Threat> {
        return apiClient.post(`/threats/${id}/restore`, {}, { schema: threatSchema });
    },

    /** Threat<->Risk Link relations managed from the Threat page (issue #47). */
    async getRiskLinks(threatId: number): Promise<ThreatRiskLink[]> {
        return apiClient.get(`/threats/${threatId}/risk-links`, { schema: threatRiskLinkListSchema });
    },

    async addRiskLink(threatId: number, riskId: number): Promise<ThreatRiskLink> {
        return apiClient.post(
            `/threats/${threatId}/risk-links`,
            { risk_id: riskId },
            { schema: threatRiskLinkSchema }
        );
    },

    async removeRiskLink(threatId: number, linkId: number): Promise<void> {
        return apiClient.delete(`/threats/${threatId}/risk-links/${linkId}`, { schema: voidSchema });
    },
};

/** The Risk-detail end of the ICT Register Link relations (issue #47). */
export const riskRegisterLinksApi = {
    async getThreatLinks(riskId: number): Promise<ThreatRiskLink[]> {
        return apiClient.get(`/risks/${riskId}/threat-links`, { schema: threatRiskLinkListSchema });
    },

    async addThreatLink(riskId: number, threatId: number): Promise<ThreatRiskLink> {
        return apiClient.post(
            `/risks/${riskId}/threat-links`,
            { threat_id: threatId },
            { schema: threatRiskLinkSchema }
        );
    },

    async removeThreatLink(riskId: number, linkId: number): Promise<void> {
        return apiClient.delete(`/risks/${riskId}/threat-links/${linkId}`, { schema: voidSchema });
    },

    async getProcessLinks(riskId: number): Promise<RiskProcessLink[]> {
        return apiClient.get(`/risks/${riskId}/process-links`, { schema: riskProcessLinkListSchema });
    },

    async addProcessLink(
        riskId: number,
        processId: number,
        requestReason: string,
    ): Promise<RiskProcessLink | ProcessApprovalQueuedResponse> {
        return apiClient.post(
            `/risks/${riskId}/process-links`,
            { process_id: processId, request_reason: requestReason },
            { schema: riskProcessLinkSchema.or(processApprovalQueuedResponseSchema) }
        );
    },

    async removeProcessLink(
        riskId: number,
        linkId: number,
        requestReason: string,
    ): Promise<void | ProcessApprovalQueuedResponse> {
        return apiClient.delete(`/risks/${riskId}/process-links/${linkId}`, {
            body: JSON.stringify({ request_reason: requestReason }),
            schema: voidSchema.or(processApprovalQueuedResponseSchema),
        });
    },

    async getAssetLinks(riskId: number): Promise<RiskAssetLink[]> {
        return apiClient.get(`/risks/${riskId}/asset-links`, { schema: riskAssetLinkListSchema });
    },

    async addAssetLink(riskId: number, assetId: number): Promise<RiskAssetLink> {
        return apiClient.post(
            `/risks/${riskId}/asset-links`,
            { asset_id: assetId },
            { schema: riskAssetLinkSchema }
        );
    },

    async removeAssetLink(riskId: number, linkId: number): Promise<void> {
        return apiClient.delete(`/risks/${riskId}/asset-links/${linkId}`, { schema: voidSchema });
    },
};
