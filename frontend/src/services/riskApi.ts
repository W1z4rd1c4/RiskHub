import { apiClient } from './apiClient';
import type {
    Risk,
    RiskCreate,
    RiskUpdate,
    RiskControlLink,
    RiskType,
    RiskStatus,
    ControlEffectiveness,
    RiskListResponse
} from '@/types/risk';

export const riskApi = {
    async getRisks(params: {
        skip?: number;
        limit?: number;
        department_id?: number;
        status?: RiskStatus;
        risk_type?: RiskType;
        is_priority?: boolean;
        search?: string;
        has_breach?: boolean;
    }): Promise<RiskListResponse> {
        return apiClient.get<RiskListResponse>('/risks', { params });
    },

    async getRisk(id: number): Promise<Risk> {
        return apiClient.get<Risk>(`/risks/${id}`);
    },

    async createRisk(data: RiskCreate): Promise<Risk> {
        return apiClient.post<Risk>('/risks', data);
    },

    async updateRisk(id: number, data: RiskUpdate): Promise<Risk> {
        return apiClient.patch<Risk>(`/risks/${id}`, data);
    },

    async deleteRisk(id: number): Promise<void> {
        return apiClient.delete<void>(`/risks/${id}`);
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
