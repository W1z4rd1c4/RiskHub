import { apiClient } from './apiClient';
import {
    ictServiceTaxonomySchema,
    vendorSubOutsourcingListSchema,
    vendorSubOutsourcingSchema,
    voidSchema,
} from '@/services/api/schemas';
import type { IctServiceType, VendorSubOutsourcing, VendorSubOutsourcingWritePayload } from '@/types/vendorSubOutsourcing';

/** ICT Register Sub-outsourcing chains, maintained inside a Vendor's detail (issue #45). */
export const vendorSubOutsourcingApi = {
    async getEntries(vendorId: number, includeArchived = true): Promise<VendorSubOutsourcing[]> {
        return apiClient.get(`/vendors/${vendorId}/sub-outsourcing`, {
            params: { include_archived: includeArchived },
            schema: vendorSubOutsourcingListSchema,
        });
    },

    async createEntry(
        vendorId: number,
        data: VendorSubOutsourcingWritePayload,
    ): Promise<VendorSubOutsourcing> {
        return apiClient.post(`/vendors/${vendorId}/sub-outsourcing`, data, {
            schema: vendorSubOutsourcingSchema,
        });
    },

    async updateEntry(
        vendorId: number,
        entryId: number,
        data: VendorSubOutsourcingWritePayload,
    ): Promise<VendorSubOutsourcing> {
        return apiClient.patch(`/vendors/${vendorId}/sub-outsourcing/${entryId}`, data, {
            schema: vendorSubOutsourcingSchema,
        });
    },

    async archiveEntry(vendorId: number, entryId: number): Promise<void> {
        return apiClient.delete(`/vendors/${vendorId}/sub-outsourcing/${entryId}`, { schema: voidSchema });
    },

    async restoreEntry(vendorId: number, entryId: number): Promise<VendorSubOutsourcing> {
        return apiClient.post(`/vendors/${vendorId}/sub-outsourcing/${entryId}/restore`, {}, {
            schema: vendorSubOutsourcingSchema,
        });
    },

    /** S01-S19 ICT service taxonomy from the ICT Register reference API (issue #41). */
    async getIctServiceTaxonomy(): Promise<IctServiceType[]> {
        const response = await apiClient.get('/ict-register/reference/ict-service-taxonomy', {
            schema: ictServiceTaxonomySchema,
        });
        return response.services;
    },
};
