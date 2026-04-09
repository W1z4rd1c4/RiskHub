import { apiClient } from './apiClient';
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
        limit?: number;
        department_id?: number;
        status?: string;
        search?: string;
        process?: string;
        category?: string;
        include_archived?: boolean;
        monitoring_status?: ControlMonitoringStatus;
    }): Promise<ControlListResponse> {
        return apiClient.get('/controls', { params, schema: controlListResponseSchema });
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
