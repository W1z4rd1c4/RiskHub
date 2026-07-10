import { apiClient } from './apiClient';
import {
    riskAssetLinkListSchema,
    riskAssetLinkSchema,
    riskProcessLinkListSchema,
    riskProcessLinkSchema,
    threatListResponseSchema,
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
    ThreatRiskLink,
    ThreatWritePayload,
} from '@/types/threat';

export const threatApi = {
    async getThreats(params: ThreatListParams): Promise<ThreatListResponse> {
        return apiClient.get('/threats', {
            params: {
                offset: params.offset,
                limit: params.limit,
                search: params.search,
                include_archived: params.include_archived,
                sort_by: params.sort_by,
                sort_order: params.sort_order,
            },
            schema: threatListResponseSchema,
        });
    },

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

    async addProcessLink(riskId: number, processId: number): Promise<RiskProcessLink> {
        return apiClient.post(
            `/risks/${riskId}/process-links`,
            { process_id: processId },
            { schema: riskProcessLinkSchema }
        );
    },

    async removeProcessLink(riskId: number, linkId: number): Promise<void> {
        return apiClient.delete(`/risks/${riskId}/process-links/${linkId}`, { schema: voidSchema });
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
