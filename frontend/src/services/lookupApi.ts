import { apiClient } from './apiClient';

export const lookupApi = {
    async getUsers(): Promise<any[]> {
        return apiClient.get<any[]>('/users');
    },

    async getDepartments(): Promise<any[]> {
        return apiClient.get<any[]>('/departments');
    }
};

