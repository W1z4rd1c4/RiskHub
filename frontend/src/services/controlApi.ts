import { apiClient } from './apiClient';
import { buildCollectionParams, normalizeCollectionResponse } from './collectionApi';
import {
    approvalCreatedResponseSchema,
    controlExecutionArraySchema,
    controlExecutionSchema,
    controlListResponseSchema,
    controlOrApprovalSchema,
    controlRiskLinkArraySchema,
    controlRiskLinkSchema,
    controlSchema,
    voidSchema,
} from '@/services/api/schemas';
import type {
    Control,
    ControlCreate,
    ControlMonitoringStatus,
    ControlUpdate,
    ControlRiskLink,
    ControlListResponse
} from '@/types/control';
import type { ControlEffectiveness } from '@/types/risk';
import type { ApprovalCreatedResponse } from '@/types/approval';
import type { ControlExecution, ControlExecutionCreate } from '@/types/execution';

export const controlApi = {
    async getControls(params: {
        skip?: number;
        offset?: number;
        limit?: number;
        department_id?: number;
        status?: string;
        search?: string;
        process?: string;
        category?: string;
        include_archived?: boolean;
        monitoring_status?: ControlMonitoringStatus;
        group_by?: string;
        group_value?: string;
    }): Promise<ControlListResponse> {
        const response = await apiClient.get('/controls', {
            params: buildCollectionParams({
                offset: params.offset ?? params.skip,
                limit: params.limit,
                filters: {
                    department_id: params.department_id,
                    status: params.status,
                    search: params.search,
                    process: params.process,
                    category: params.category,
                    include_archived: params.include_archived,
                    monitoring_status: params.monitoring_status,
                },
                groupBy: params.group_by,
                groupValue: params.group_value,
            }),
            schema: controlListResponseSchema,
        });
        return normalizeCollectionResponse(response);
    },

    async getControl(id: number): Promise<Control> {
        return apiClient.get(`/controls/${id}`, { schema: controlSchema });
    },

    async createControl(data: ControlCreate): Promise<Control> {
        return apiClient.post('/controls', data, { schema: controlSchema });
    },

    async updateControl(id: number, data: ControlUpdate): Promise<Control | ApprovalCreatedResponse> {
        return apiClient.patch(`/controls/${id}`, data, { schema: controlOrApprovalSchema });
    },

    async deleteControl(id: number, reason: string = 'Archived by user'): Promise<void | ApprovalCreatedResponse> {
        return apiClient.delete(`/controls/${id}?reason=${encodeURIComponent(reason)}`, {
            schema: approvalCreatedResponseSchema.or(voidSchema),
        });
    },

    async restoreControl(id: number): Promise<Control> {
        return apiClient.post(`/controls/${id}/restore`, {}, { schema: controlSchema });
    },

    async logExecution(controlId: number, data: ControlExecutionCreate): Promise<ControlExecution> {
        return apiClient.post(`/controls/${controlId}/executions`, data, { schema: controlExecutionSchema });
    },

    async getExecutions(controlId: number): Promise<ControlExecution[]> {
        return apiClient.get(`/controls/${controlId}/executions`, { schema: controlExecutionArraySchema });
    },

    async getLinkedRisks(controlId: number): Promise<ControlRiskLink[]> {
        return apiClient.get(`/controls/${controlId}/risks`, { schema: controlRiskLinkArraySchema });
    },

    async linkRisk(
        controlId: number,
        data: { risk_id: number; effectiveness: ControlEffectiveness; notes?: string }
    ): Promise<ControlRiskLink> {
        return apiClient.post(`/controls/${controlId}/risks`, data, { schema: controlRiskLinkSchema });
    },

    async unlinkRisk(controlId: number, riskId: number): Promise<void> {
        return apiClient.delete(`/controls/${controlId}/risks/${riskId}`, { schema: voidSchema });
    }
};
