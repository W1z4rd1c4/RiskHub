import { apiClient } from './apiClient';
import type {
    Risk,
    RiskCreate,
    RiskUpdate,
    RiskControlLink,
    RiskStatus,
    ControlEffectiveness,
    RiskListResponse
} from '@/types/risk';
import type { ApprovalCreatedResponse } from '@/types/approval';

export const riskApi = {
    async getRisks(params: {
        skip?: number;
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
    }): Promise<RiskListResponse> {
        return apiClient.get<RiskListResponse>('/risks', { params });
    },

    async getRisk(id: number): Promise<Risk> {
        return apiClient.get<Risk>(`/risks/${id}`);
    },

    async createRisk(data: RiskCreate): Promise<Risk> {
        return apiClient.post<Risk>('/risks', data);
    },

    async updateRisk(id: number, data: RiskUpdate): Promise<Risk | ApprovalCreatedResponse> {
        return apiClient.patch<Risk | ApprovalCreatedResponse>(`/risks/${id}`, data);
    },

    async deleteRisk(id: number, reason: string = 'Archived by user'): Promise<void> {
        return apiClient.delete<void>(`/risks/${id}`, { params: { reason } });
    },

    async getLinkedControls(riskId: number): Promise<RiskControlLink[]> {
        return apiClient.get<RiskControlLink[]>(`/risks/${riskId}/controls`);
    },

    async linkControl(
        riskId: number,
        data: { control_id: number; effectiveness: ControlEffectiveness; notes?: string }
    ): Promise<RiskControlLink> {
        return apiClient.post<RiskControlLink>(`/risks/${riskId}/controls`, data);
    },

    async unlinkControl(riskId: number, controlId: number): Promise<void> {
        return apiClient.delete<void>(`/risks/${riskId}/controls/${controlId}`);
    },
};
