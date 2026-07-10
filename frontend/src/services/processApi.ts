import { apiClient } from './apiClient';
import {
    ictClosedListCollectionSchema,
    processListResponseSchema,
    processSchema,
    processVendorLinkListSchema,
    processVendorLinkSchema,
    voidSchema,
} from '@/services/api/schemas';
import type {
    Process,
    ProcessListParams,
    ProcessListResponse,
    ProcessVendorLink,
    ProcessVendorLinkCreatePayload,
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

    /** Process<->Vendor Link relations (sheet 11 §1), managed from the Process detail. */
    async getVendorLinks(processId: number): Promise<ProcessVendorLink[]> {
        return apiClient.get(`/processes/${processId}/vendor-links`, { schema: processVendorLinkListSchema });
    },

    async addVendorLink(processId: number, data: ProcessVendorLinkCreatePayload): Promise<ProcessVendorLink> {
        return apiClient.post(`/processes/${processId}/vendor-links`, data, { schema: processVendorLinkSchema });
    },

    async removeVendorLink(processId: number, linkId: number): Promise<void> {
        return apiClient.delete(`/processes/${processId}/vendor-links/${linkId}`, { schema: voidSchema });
    },

    /** Workbook closed lists from the ICT Register reference registry (issue #41). */
    async getClosedLists(): Promise<Record<string, Array<string | number>>> {
        const response = await apiClient.get('/ict-register/reference/closed-lists', {
            schema: ictClosedListCollectionSchema,
        });
        return Object.fromEntries(response.lists.map((list) => [list.name, list.values]));
    },
};
