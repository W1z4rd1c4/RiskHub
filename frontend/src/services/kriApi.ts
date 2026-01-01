import { apiClient } from './apiClient';
import type {
    KeyRiskIndicator,
    KRICreate,
    KRIUpdate,
    KRIListResponse,
    KRIHistoryEntry,
    KRIHistoryListResponse,
    KRIRecordValue,
    KRIHistoryEdit,
    OverdueKRI,
    DueSoonKRI,
} from '../types/kri';

export const kriApi = {
    async getKRIs(params?: { risk_id?: number; breach_only?: boolean; page?: number; size?: number; skip?: number }): Promise<KRIListResponse> {
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

    // History endpoints
    async recordValue(kriId: number, data: KRIRecordValue): Promise<KeyRiskIndicator> {
        return apiClient.post<KeyRiskIndicator>(`/kris/${kriId}/values`, data);
    },

    async getHistory(
        kriId: number,
        params?: { from_date?: string; to_date?: string; page?: number; size?: number }
    ): Promise<KRIHistoryListResponse> {
        return apiClient.get<KRIHistoryListResponse>(`/kris/${kriId}/history`, { params });
    },

    async requestHistoryEdit(
        kriId: number,
        entryId: number,
        data: KRIHistoryEdit
    ): Promise<KRIHistoryEntry | { message: string; approval_id: number }> {
        return apiClient.patch<KRIHistoryEntry>(`/kris/${kriId}/history/${entryId}`, data);
    },

    async getOverdue(params?: { department_id?: number }): Promise<OverdueKRI[]> {
        return apiClient.get<OverdueKRI[]>('/kris/overdue', { params });
    },

    async getDueSoon(params?: { department_id?: number }): Promise<DueSoonKRI[]> {
        return apiClient.get<DueSoonKRI[]>('/kris/due-soon', { params });
    },
};
