import { apiClient } from './apiClient';
import {
    assetAssetLinkListSchema,
    assetAssetLinkSchema,
    assetListResponseSchema,
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
    AssetVendorLink,
    AssetVendorLinkCreatePayload,
    AssetWritePayload,
    ProcessAssetLink,
    ProcessAssetLinkCreatePayload,
    ProcessAssetLinkUpdatePayload,
} from '@/types/asset';

export const assetApi = {
    async getAssets(params: AssetListParams): Promise<AssetListResponse> {
        return apiClient.get('/assets', {
            params: {
                offset: params.offset,
                limit: params.limit,
                search: params.search,
                include_archived: params.include_archived,
                sort_by: params.sort_by,
                sort_order: params.sort_order,
            },
            schema: assetListResponseSchema,
        });
    },

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
