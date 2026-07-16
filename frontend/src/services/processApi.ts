import { apiClient } from './apiClient';
import {
    ictClosedListCollectionSchema,
    processListResponseSchema,
    processLookupOptionSchema,
    processSchema,
    processVendorLinkListSchema,
    processVendorLinkSchema,
    voidSchema,
} from '@/services/api/schemas';
import type {
    Process,
    ProcessListParams,
    ProcessListResponse,
    ProcessLookupOption,
    ProcessVendorLink,
    ProcessVendorLinkCreatePayload,
    ProcessWritePayload,
} from '@/types/process';

type ProcessLookupKind = 'owners' | 'departments' | 'assets' | 'vendors' | 'risks';

function appendValues(params: URLSearchParams, key: string, values: ReadonlyArray<string | number> | undefined) {
    values?.forEach((value) => params.append(key, String(value)));
}

export function buildProcessCollectionQuery(params: ProcessListParams): URLSearchParams {
    const query = new URLSearchParams();
    const set = (key: string, value: string | number | boolean | undefined) => {
        if (value !== undefined && value !== '') query.set(key, String(value));
    };
    set('offset', params.offset);
    set('limit', params.limit);
    set('search', params.search);
    set('include_archived', params.include_archived);
    set('sort_by', params.sort_by);
    set('sort_order', params.sort_order);
    if (params.sort) set('sort', JSON.stringify(params.sort));
    set('view', params.view);
    set('group_by', params.group_by);
    set('group_value', params.group_value);
    appendValues(query, 'lifecycle', params.lifecycle);
    appendValues(query, 'department_ids', params.department_ids);
    appendValues(query, 'owner_ids', params.owner_ids);
    appendValues(query, 'l0_areas', params.l0_areas);
    appendValues(query, 'criticality', params.criticality);
    set('cif', params.cif);
    set('is_complete', params.is_complete);
    appendValues(query, 'licensed_activity', params.licensed_activity);
    appendValues(query, 'bcm_link', params.bcm_link);
    appendValues(query, 'dr_test_result', params.dr_test_result);
    set('mtpd_min', params.mtpd_min);
    set('mtpd_max', params.mtpd_max);
    appendValues(query, 'linked_asset_ids', params.linked_asset_ids);
    appendValues(query, 'linked_vendor_ids', params.linked_vendor_ids);
    appendValues(query, 'linked_risk_ids', params.linked_risk_ids);

    const filterEntries: Array<[string, unknown]> = [
        ['search', params.search],
        ['include_archived', params.include_archived],
        ['lifecycle', params.lifecycle],
        ['department_ids', params.department_ids],
        ['owner_ids', params.owner_ids],
        ['l0_areas', params.l0_areas],
        ['criticality', params.criticality],
        ['cif', params.cif],
        ['is_complete', params.is_complete],
        ['licensed_activity', params.licensed_activity],
        ['bcm_link', params.bcm_link],
        ['dr_test_result', params.dr_test_result],
        ['mtpd_min', params.mtpd_min],
        ['mtpd_max', params.mtpd_max],
        ['linked_asset_ids', params.linked_asset_ids],
        ['linked_vendor_ids', params.linked_vendor_ids],
        ['linked_risk_ids', params.linked_risk_ids],
    ];
    const filters: Record<string, unknown> = Object.fromEntries(
        filterEntries.filter(([, value]) => value !== undefined && (!Array.isArray(value) || value.length > 0)),
    );
    if (Object.keys(filters).length > 0) set('filters', JSON.stringify(filters));
    return query;
}

async function downloadProcessExport(params: ProcessListParams, locale: 'en' | 'cs'): Promise<void> {
    const query = buildProcessCollectionQuery(params);
    query.delete('offset');
    query.delete('limit');
    query.set('format', 'csv');
    query.set('locale', locale);
    const { blob, headers } = await apiClient.getBlob(`/processes/export?${query.toString()}`, { timeoutMs: null });
    const match = headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = match?.[1] ?? 'processes.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export const processApi = {
    async getProcesses(params: ProcessListParams): Promise<ProcessListResponse> {
        return apiClient.get('/processes', {
            params: buildProcessCollectionQuery(params),
            schema: processListResponseSchema,
        });
    },

    async getLookupOptions(
        kind: ProcessLookupKind,
        options: { search?: string; selectedIds?: number[]; limit?: number } = {},
    ): Promise<ProcessLookupOption[]> {
        return apiClient.get(`/processes/lookups/${kind}`, {
            params: {
                search: options.search,
                selected_ids: options.selectedIds,
                limit: options.limit ?? 50,
            },
            schema: processLookupOptionSchema.array(),
        });
    },

    downloadExport: downloadProcessExport,

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
