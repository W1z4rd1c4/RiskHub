import { apiClient } from './apiClient';
import {
    processApprovalQueuedResponseSchema,
    vendorContractListSchema,
    vendorContractSchema,
    voidSchema,
} from '@/services/api/schemas';
import type { ProcessApprovalQueuedResponse } from '@/types/process';
import type { VendorContract, VendorContractWritePayload } from '@/types/vendorContract';

/** ICT Register Contracts, maintained inside a Vendor's detail (issue #44). */
export const vendorContractApi = {
    async getContracts(vendorId: number, includeArchived = true): Promise<VendorContract[]> {
        return apiClient.get(`/vendors/${vendorId}/contracts`, {
            params: { include_archived: includeArchived },
            schema: vendorContractListSchema,
        });
    },

    async createContract(
        vendorId: number,
        data: VendorContractWritePayload,
    ): Promise<VendorContract | ProcessApprovalQueuedResponse> {
        return apiClient.post(`/vendors/${vendorId}/contracts`, data, {
            schema: vendorContractSchema.or(processApprovalQueuedResponseSchema),
        });
    },

    async updateContract(
        vendorId: number,
        contractId: number,
        data: VendorContractWritePayload,
    ): Promise<VendorContract | ProcessApprovalQueuedResponse> {
        return apiClient.patch(`/vendors/${vendorId}/contracts/${contractId}`, data, {
            schema: vendorContractSchema.or(processApprovalQueuedResponseSchema),
        });
    },

    async archiveContract(
        vendorId: number,
        contractId: number,
        requestReason: string,
    ): Promise<void | ProcessApprovalQueuedResponse> {
        return apiClient.delete(`/vendors/${vendorId}/contracts/${contractId}`, {
            body: JSON.stringify({ request_reason: requestReason }),
            schema: voidSchema.or(processApprovalQueuedResponseSchema),
        });
    },

    async restoreContract(vendorId: number, contractId: number): Promise<VendorContract> {
        return apiClient.post(`/vendors/${vendorId}/contracts/${contractId}/restore`, {}, {
            schema: vendorContractSchema,
        });
    },
};
