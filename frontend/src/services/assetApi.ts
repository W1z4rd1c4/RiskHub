import { apiClient } from './apiClient';
import {
    assetAssetLinkListSchema,
    assetAssetLinkSchema,
    assetListResponseSchema,
    assetLookupOptionSchema,
    assetSchema,
    assetVendorLinkListSchema,
    assetVendorLinkSchema,
    ictClosedListCollectionSchema,
    processAssetLinkListSchema,
    processAssetLinkSchema,
    voidSchema,
} from '@/services/api/schemas';
import type {
    Asset,
    AssetAssetLink,
    AssetAssetLinkCreatePayload,
    AssetListParams,
    AssetListResponse,
    AssetLookupOption,
    AssetVendorLink,
    AssetVendorLinkCreatePayload,
    AssetWritePayload,
    ProcessAssetLink,
    ProcessAssetLinkCreatePayload,
    ProcessAssetLinkUpdatePayload,
} from '@/types/asset';

export type AssetLookupKind = 'business-owners' | 'ict-owners' | 'departments' | 'processes' | 'assets' | 'vendors' | 'risks';

function appendValues(params: URLSearchParams, key: string, values: ReadonlyArray<string | number> | undefined) {
    values?.forEach((value) => params.append(key, String(value)));
}

export function buildAssetCollectionQuery(params: AssetListParams): URLSearchParams {
    const query = new URLSearchParams();
    const set = (key: string, value: string | number | boolean | undefined) => {
        if (value !== undefined && value !== '') query.set(key, String(value));
    };
    set('offset', params.offset); set('limit', params.limit); set('search', params.search);
    set('include_archived', params.include_archived); set('sort_by', params.sort_by); set('sort_order', params.sort_order);
    if (params.sort) set('sort', JSON.stringify(params.sort));
    set('view', params.view); set('group_by', params.group_by); set('group_value', params.group_value);
    appendValues(query, 'lifecycle', params.lifecycle);
    appendValues(query, 'department_ids', params.department_ids); appendValues(query, 'business_owner_ids', params.business_owner_ids);
    appendValues(query, 'ict_owner_ids', params.ict_owner_ids); appendValues(query, 'asset_types', params.asset_types);
    appendValues(query, 'asset_levels', params.asset_levels); appendValues(query, 'deployment_models', params.deployment_models);
    appendValues(query, 'criticality', params.criticality); set('cif', params.cif); set('legacy', params.legacy);
    set('spof', params.spof); set('external_dependency', params.external_dependency);
    appendValues(query, 'gdpr_relevance', params.gdpr_relevance); appendValues(query, 'ai_relevance', params.ai_relevance);
    set('internet_exposed', params.internet_exposed); appendValues(query, 'data_classification', params.data_classification);
    set('is_complete', params.is_complete); appendValues(query, 'lifecycle_states', params.lifecycle_states);
    appendValues(query, 'linked_process_ids', params.linked_process_ids); appendValues(query, 'linked_asset_ids', params.linked_asset_ids);
    appendValues(query, 'linked_vendor_ids', params.linked_vendor_ids); appendValues(query, 'linked_risk_ids', params.linked_risk_ids);
    set('has_process_link', params.has_process_link);

    const filterEntries: Array<[string, unknown]> = [
        ['search', params.search], ['include_archived', params.include_archived], ['lifecycle', params.lifecycle],
        ['department_ids', params.department_ids], ['business_owner_ids', params.business_owner_ids],
        ['ict_owner_ids', params.ict_owner_ids], ['asset_types', params.asset_types], ['asset_levels', params.asset_levels],
        ['deployment_models', params.deployment_models], ['criticality', params.criticality], ['cif', params.cif],
        ['legacy', params.legacy], ['spof', params.spof], ['external_dependency', params.external_dependency],
        ['gdpr_relevance', params.gdpr_relevance], ['ai_relevance', params.ai_relevance],
        ['internet_exposed', params.internet_exposed], ['data_classification', params.data_classification],
        ['is_complete', params.is_complete], ['lifecycle_states', params.lifecycle_states],
        ['linked_process_ids', params.linked_process_ids], ['linked_asset_ids', params.linked_asset_ids],
        ['linked_vendor_ids', params.linked_vendor_ids], ['linked_risk_ids', params.linked_risk_ids],
        ['has_process_link', params.has_process_link],
    ];
    const filters = Object.fromEntries(filterEntries.filter(([, value]) => value !== undefined && (!Array.isArray(value) || value.length > 0)));
    if (Object.keys(filters).length > 0) set('filters', JSON.stringify(filters));
    return query;
}

async function downloadAssetExport(params: AssetListParams, locale: 'en' | 'cs'): Promise<void> {
    const query = buildAssetCollectionQuery(params);
    query.delete('offset'); query.delete('limit'); query.set('format', 'csv'); query.set('locale', locale);
    const { blob, headers } = await apiClient.getBlob(`/assets/export?${query.toString()}`, { timeoutMs: null });
    const match = headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = match?.[1] ?? 'assets.csv';
    document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
}

export const assetApi = {
    async getAssets(params: AssetListParams): Promise<AssetListResponse> {
        return apiClient.get('/assets', {
            params: buildAssetCollectionQuery(params),
            schema: assetListResponseSchema,
        });
    },

    async getLookupOptions(kind: AssetLookupKind, options: { search?: string; selectedIds?: number[]; limit?: number } = {}): Promise<AssetLookupOption[]> {
        return apiClient.get(`/assets/lookups/${kind}`, {
            params: { search: options.search, selected_ids: options.selectedIds, limit: options.limit ?? 50 },
            schema: assetLookupOptionSchema.array(),
        });
    },

    downloadExport: downloadAssetExport,

    async getAsset(id: number): Promise<Asset> {
        return apiClient.get(`/assets/${id}`, { schema: assetSchema });
    },

    async createAsset(data: AssetWritePayload): Promise<Asset> {
        return apiClient.post('/assets', data, { schema: assetSchema });
    },

    async updateAsset(id: number, data: AssetWritePayload): Promise<Asset> {
        return apiClient.patch(`/assets/${id}`, data, { schema: assetSchema });
    },

    async archiveAsset(id: number): Promise<void> {
        return apiClient.delete(`/assets/${id}`, { schema: voidSchema });
    },

    async restoreAsset(id: number): Promise<Asset> {
        return apiClient.post(`/assets/${id}/restore`, {}, { schema: assetSchema });
    },

    /** Process<->Asset Link relations, managed from the Asset detail. */
    async getProcessLinks(assetId: number): Promise<ProcessAssetLink[]> {
        return apiClient.get(`/assets/${assetId}/process-links`, { schema: processAssetLinkListSchema });
    },

    async addProcessLink(assetId: number, data: ProcessAssetLinkCreatePayload): Promise<ProcessAssetLink> {
        return apiClient.post(`/assets/${assetId}/process-links`, data, { schema: processAssetLinkSchema });
    },

    /** Setting is_primary: true atomically demotes the previous primary. */
    async updateProcessLink(
        assetId: number,
        processId: number,
        data: ProcessAssetLinkUpdatePayload,
    ): Promise<ProcessAssetLink> {
        return apiClient.patch(`/assets/${assetId}/process-links/${processId}`, data, {
            schema: processAssetLinkSchema,
        });
    },

    async removeProcessLink(assetId: number, processId: number): Promise<void> {
        return apiClient.delete(`/assets/${assetId}/process-links/${processId}`, { schema: voidSchema });
    },

    /** Asset<->Asset Link relations (directional: dependent relies on supporting). */
    async getAssetLinks(assetId: number): Promise<AssetAssetLink[]> {
        return apiClient.get(`/assets/${assetId}/asset-links`, { schema: assetAssetLinkListSchema });
    },

    async addAssetLink(assetId: number, data: AssetAssetLinkCreatePayload): Promise<AssetAssetLink> {
        return apiClient.post(`/assets/${assetId}/asset-links`, data, { schema: assetAssetLinkSchema });
    },

    async removeAssetLink(assetId: number, linkId: number): Promise<void> {
        return apiClient.delete(`/assets/${assetId}/asset-links/${linkId}`, { schema: voidSchema });
    },

    /** Asset<->Vendor Link relations (sheet 10_VAD), managed from the Asset detail. */
    async getVendorLinks(assetId: number): Promise<AssetVendorLink[]> {
        return apiClient.get(`/assets/${assetId}/vendor-links`, { schema: assetVendorLinkListSchema });
    },

    async addVendorLink(assetId: number, data: AssetVendorLinkCreatePayload): Promise<AssetVendorLink> {
        return apiClient.post(`/assets/${assetId}/vendor-links`, data, { schema: assetVendorLinkSchema });
    },

    async removeVendorLink(assetId: number, linkId: number): Promise<void> {
        return apiClient.delete(`/assets/${assetId}/vendor-links/${linkId}`, { schema: voidSchema });
    },

    /** Workbook closed lists from the ICT Register reference registry (issue #41). */
    async getClosedLists(): Promise<Record<string, Array<string | number>>> {
        const response = await apiClient.get('/ict-register/reference/closed-lists', {
            schema: ictClosedListCollectionSchema,
        });
        return Object.fromEntries(response.lists.map((list) => [list.name, list.values]));
    },
};
