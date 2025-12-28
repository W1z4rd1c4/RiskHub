import { apiClient } from './apiClient';
import type { KeyRiskIndicator, KRICreate, KRIUpdate, KRIListResponse } from '../types/kri';

export const kriApi = {
    async getKRIs(params?: { risk_id?: number; breach_only?: boolean; page?: number; size?: number }): Promise<KRIListResponse> {
        return apiClient.get<KRIListResponse>('/kris', { params });
    },

    async getBreaches(params?: { department_id?: number }): Promise<KeyRiskIndicator[]> {
        return apiClient.get<KeyRiskIndicator[]>('/kris/breaches', { params });
    },

    async getKRI(id: number): Promise<KeyRiskIndicator> {
        return apiClient.get<KeyRiskIndicator>(`/kris/${id}`);
    },

    async createKRI(data: KRICreate): Promise<KeyRiskIndicator> {
        return apiClient.post<KeyRiskIndicator>('/kris', data);
    },

    async updateKRI(id: number, data: KRIUpdate): Promise<KeyRiskIndicator> {
        return apiClient.put<KeyRiskIndicator>(`/kris/${id}`, data);
    },

    async deleteKRI(id: number): Promise<void> {
        return apiClient.delete<void>(`/kris/${id}`);
    },
};
