import { apiClient } from './apiClient';
import { reasonBody, reasonField } from './api/governedReason';
import {
    linkStatusSchema,
    linkedControlArraySchema,
    linkedKRIArraySchema,
    linkedRiskArraySchema,
    processApprovalQueuedResponseSchema,
    voidSchema,
} from '@/services/api/schemas';
import type { ProcessApprovalQueuedResponse } from '@/types/process';
import type { LinkedControl, LinkedKRI, LinkedRisk, VendorLinkStatus } from '@/types/vendorLink';

const linkResultSchema = linkStatusSchema.or(processApprovalQueuedResponseSchema);
const unlinkResultSchema = voidSchema.or(processApprovalQueuedResponseSchema);

/**
 * Vendor Risk/Control/KRI link mutations follow the governed protected-Vendor
 * contract (#100): a protected Vendor requires a request reason and answers
 * 202 ApprovalQueuedResponse instead of mutating directly, so every mutation
 * parses the union of the direct-success and approval-queued shapes.
 */
export const vendorLinkApi = {
    async getLinkedRisks(vendorId: number): Promise<LinkedRisk[]> {
        return apiClient.get(`/vendors/${vendorId}/linked-risks`, { schema: linkedRiskArraySchema });
    },

    async linkRisk(
        vendorId: number,
        riskId: number,
        requestReason?: string,
    ): Promise<VendorLinkStatus | ProcessApprovalQueuedResponse> {
        return apiClient.post(`/vendors/${vendorId}/linked-risks`, {
            risk_id: riskId,
            ...reasonField(requestReason),
        }, { schema: linkResultSchema });
    },

    async unlinkRisk(
        vendorId: number,
        riskId: number,
        requestReason?: string,
    ): Promise<void | ProcessApprovalQueuedResponse> {
        return apiClient.delete(`/vendors/${vendorId}/linked-risks/${riskId}`, {
            ...reasonBody(requestReason),
            schema: unlinkResultSchema,
        });
    },

    async getLinkedControls(vendorId: number): Promise<LinkedControl[]> {
        return apiClient.get(`/vendors/${vendorId}/linked-controls`, { schema: linkedControlArraySchema });
    },

    async linkControl(
        vendorId: number,
        controlId: number,
        requestReason?: string,
    ): Promise<VendorLinkStatus | ProcessApprovalQueuedResponse> {
        return apiClient.post(`/vendors/${vendorId}/linked-controls`, {
            control_id: controlId,
            ...reasonField(requestReason),
        }, { schema: linkResultSchema });
    },

    async unlinkControl(
        vendorId: number,
        controlId: number,
        requestReason?: string,
    ): Promise<void | ProcessApprovalQueuedResponse> {
        return apiClient.delete(`/vendors/${vendorId}/linked-controls/${controlId}`, {
            ...reasonBody(requestReason),
            schema: unlinkResultSchema,
        });
    },

    async getLinkedKRIs(vendorId: number): Promise<LinkedKRI[]> {
        return apiClient.get(`/vendors/${vendorId}/linked-kris`, { schema: linkedKRIArraySchema });
    },

    async linkKRI(
        vendorId: number,
        kriId: number,
        requestReason?: string,
    ): Promise<VendorLinkStatus | ProcessApprovalQueuedResponse> {
        return apiClient.post(`/vendors/${vendorId}/linked-kris`, {
            kri_id: kriId,
            ...reasonField(requestReason),
        }, { schema: linkResultSchema });
    },

    async unlinkKRI(
        vendorId: number,
        kriId: number,
        requestReason?: string,
    ): Promise<void | ProcessApprovalQueuedResponse> {
        return apiClient.delete(`/vendors/${vendorId}/linked-kris/${kriId}`, {
            ...reasonBody(requestReason),
            schema: unlinkResultSchema,
        });
    },
};
