import { apiClient } from './apiClient';
import type {
    Control,
    ControlCreate,
    ControlUpdate,
    ControlExecution,
    ControlExecutionCreate,
    ControlRiskLink,
    ControlListResponse
} from '@/types/control';
import { ControlEffectiveness } from '@/types/risk';

export const controlApi = {
    async getControls(params: {
        skip?: number;
        limit?: number;
        department_id?: number;
        status?: string;
        search?: string;
        process?: string;
        category?: string;
    }): Promise<ControlListResponse> {
        return apiClient.get<ControlListResponse>('/controls', { params });
    },

    async getControl(id: number): Promise<Control> {
        return apiClient.get<Control>(`/controls/${id}`);
    },

    async createControl(data: ControlCreate): Promise<Control> {
        return apiClient.post<Control>('/controls', data);
    },

    async updateControl(id: number, data: ControlUpdate): Promise<Control> {
        return apiClient.patch<Control>(`/controls/${id}`, data);
    },

    async deleteControl(id: number, reason: string = 'Archived by user'): Promise<void> {
        return apiClient.delete<void>(`/controls/${id}?reason=${encodeURIComponent(reason)}`);
    },

    async logExecution(controlId: number, data: ControlExecutionCreate): Promise<ControlExecution> {
        return apiClient.post<ControlExecution>(`/controls/${controlId}/executions`, data);
    },

    async getExecutions(controlId: number): Promise<ControlExecution[]> {
        return apiClient.get<ControlExecution[]>(`/controls/${controlId}/executions`);
    },

    async getLinkedRisks(controlId: number): Promise<ControlRiskLink[]> {
        return apiClient.get<ControlRiskLink[]>(`/controls/${controlId}/risks`);
    },

    async linkRisk(
        controlId: number,
        data: { risk_id: number; effectiveness: ControlEffectiveness; notes?: string }
    ): Promise<ControlRiskLink> {
        return apiClient.post<ControlRiskLink>(`/controls/${controlId}/risks`, data);
    },

    async unlinkRisk(controlId: number, riskId: number): Promise<void> {
        return apiClient.delete<void>(`/controls/${controlId}/risks/${riskId}`);
    }
};
