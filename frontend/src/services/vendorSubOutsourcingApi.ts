import { apiClient } from './apiClient';
import {
    ictServiceTaxonomySchema,
    processApprovalQueuedResponseSchema,
    vendorSubOutsourcingListSchema,
    vendorSubOutsourcingSchema,
    voidSchema,
} from '@/services/api/schemas';
import type { ProcessApprovalQueuedResponse } from '@/types/process';
import type { IctServiceType, VendorSubOutsourcing, VendorSubOutsourcingWritePayload } from '@/types/vendorSubOutsourcing';

const entryResultSchema = vendorSubOutsourcingSchema.or(processApprovalQueuedResponseSchema);
const archiveResultSchema = voidSchema.or(processApprovalQueuedResponseSchema);

function reasonField(requestReason?: string) {
    return requestReason?.trim() ? { request_reason: requestReason.trim() } : {};
}

function reasonBody(requestReason?: string) {
    return requestReason?.trim() ? { body: JSON.stringify({ request_reason: requestReason.trim() }) } : {};
}

/**
 * ICT Register Sub-outsourcing chains, maintained inside a Vendor's detail
 * (issue #45). Create/update/archive follow the governed protected-Vendor
 * contract (#101): a protected Vendor requires a request reason and answers
 * 202 ApprovalQueuedResponse instead of mutating directly, so those mutations
 * parse the union of the direct-success and approval-queued shapes. Restore
 * stays direct by design.
 */
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
        requestReason?: string,
    ): Promise<VendorSubOutsourcing | ProcessApprovalQueuedResponse> {
        return apiClient.post(`/vendors/${vendorId}/sub-outsourcing`, {
            ...data,
            ...reasonField(requestReason),
        }, { schema: entryResultSchema });
    },

    async updateEntry(
        vendorId: number,
        entryId: number,
        data: VendorSubOutsourcingWritePayload,
        requestReason?: string,
    ): Promise<VendorSubOutsourcing | ProcessApprovalQueuedResponse> {
        return apiClient.patch(`/vendors/${vendorId}/sub-outsourcing/${entryId}`, {
            ...data,
            ...reasonField(requestReason),
        }, { schema: entryResultSchema });
    },

    async archiveEntry(
        vendorId: number,
        entryId: number,
        requestReason?: string,
    ): Promise<void | ProcessApprovalQueuedResponse> {
        return apiClient.delete(`/vendors/${vendorId}/sub-outsourcing/${entryId}`, {
            ...reasonBody(requestReason),
            schema: archiveResultSchema,
        });
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
