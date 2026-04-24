import { apiClient } from './apiClient';
import { buildCollectionParams, normalizeCollectionResponse } from './collectionApi';
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
    RiskStatus,
    ControlEffectiveness,
    RiskListResponse
} from '@/types/risk';
import type { Vendor } from '@/types/vendor';
import type { ApprovalCreatedResponse } from '@/types/approval';

export const riskApi = {
    async getRisks(params: {
        skip?: number;
        offset?: number;
        limit?: number;
        department_id?: number;
        status?: RiskStatus;
        risk_type?: string; // Dynamic from Risk Hub config
        is_priority?: boolean;
        search?: string;
        has_breach?: boolean;
        min_net_score?: number;
        sort_by?: string;
        sort_order?: 'asc' | 'desc';
        process?: string;
        category?: string;
        include_archived?: boolean;
        group_by?: string;
        group_value?: string;
    }): Promise<RiskListResponse> {
        const response = await apiClient.get('/risks', {
            params: buildCollectionParams({
                offset: params.offset ?? params.skip,
                limit: params.limit,
                filters: {
                    department_id: params.department_id,
                    status: params.status,
                    risk_type: params.risk_type,
                    is_priority: params.is_priority,
                    search: params.search,
                    has_breach: params.has_breach,
                    min_net_score: params.min_net_score,
                    process: params.process,
                    category: params.category,
                    include_archived: params.include_archived,
                },
                sort: params.sort_by ? { field: params.sort_by, direction: params.sort_order ?? 'asc' } : null,
                groupBy: params.group_by,
                groupValue: params.group_value,
            }),
            schema: riskListResponseSchema,
        });
        return normalizeCollectionResponse(response);
    },

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
