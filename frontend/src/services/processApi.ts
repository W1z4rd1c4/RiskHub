import { apiClient } from './apiClient';
import {
    ictClosedListCollectionSchema,
    processListResponseSchema,
    processSchema,
    voidSchema,
} from '@/services/api/schemas';
import type {
    Process,
    ProcessListParams,
    ProcessListResponse,
    ProcessWritePayload,
} from '@/types/process';

export const processApi = {
    async getProcesses(params: ProcessListParams): Promise<ProcessListResponse> {
        return apiClient.get('/processes', {
            params: {
                offset: params.offset,
                limit: params.limit,
                search: params.search,
                include_archived: params.include_archived,
                sort_by: params.sort_by,
                sort_order: params.sort_order,
            },
            schema: processListResponseSchema,
        });
    },

    async getProcess(id: number): Promise<Process> {
        return apiClient.get(`/processes/${id}`, { schema: processSchema });
    },

    async createProcess(data: ProcessWritePayload): Promise<Process> {
        return apiClient.post('/processes', data, { schema: processSchema });
    },

    async updateProcess(id: number, data: ProcessWritePayload): Promise<Process> {
        return apiClient.patch(`/processes/${id}`, data, { schema: processSchema });
    },

    async archiveProcess(id: number): Promise<void> {
        return apiClient.delete(`/processes/${id}`, { schema: voidSchema });
    },

    async restoreProcess(id: number): Promise<Process> {
        return apiClient.post(`/processes/${id}/restore`, {}, { schema: processSchema });
    },

    /** Workbook closed lists from the ICT Register reference registry (issue #41). */
    async getClosedLists(): Promise<Record<string, Array<string | number>>> {
        const response = await apiClient.get('/ict-register/reference/closed-lists', {
            schema: ictClosedListCollectionSchema,
        });
        return Object.fromEntries(response.lists.map((list) => [list.name, list.values]));
    },
};
