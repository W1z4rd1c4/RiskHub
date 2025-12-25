import type {
    Control,
    ControlSummary,
    ControlCreate,
    ControlUpdate,
    ControlExecution,
    ControlExecutionCreate,
    ControlRiskLink
} from '@/types/control';
import { ControlEffectiveness } from '@/types/risk';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

async function getHeaders(mockUserId: number | null) {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };
    if (mockUserId) {
        headers['X-Mock-User-Id'] = String(mockUserId);
    }
    return headers;
}

export const controlApi = {
    async getControls(params: {
        skip?: number;
        limit?: number;
        department_id?: number;
        status?: string;
        search?: string;
        mockUserId: number | null;
    }): Promise<ControlSummary[]> {
        const { mockUserId, ...queryParams } = params;
        const searchParams = new URLSearchParams();
        Object.entries(queryParams).forEach(([key, value]) => {
            if (value !== undefined) searchParams.append(key, String(value));
        });

        const response = await fetch(`${API_URL}/controls?${searchParams.toString()}`, {
            headers: await getHeaders(mockUserId),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch controls: ${response.statusText}`);
        }

        return response.json();
    },

    async getControl(id: number, mockUserId: number | null): Promise<Control> {
        const response = await fetch(`${API_URL}/controls/${id}`, {
            headers: await getHeaders(mockUserId),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch control ${id}: ${response.statusText}`);
        }

        return response.json();
    },

    async createControl(data: ControlCreate, mockUserId: number | null): Promise<Control> {
        const response = await fetch(`${API_URL}/controls`, {
            method: 'POST',
            headers: await getHeaders(mockUserId),
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Failed to create control: ${response.statusText}`);
        }

        return response.json();
    },

    async updateControl(id: number, data: ControlUpdate, mockUserId: number | null): Promise<Control> {
        const response = await fetch(`${API_URL}/controls/${id}`, {
            method: 'PUT',
            headers: await getHeaders(mockUserId),
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Failed to update control ${id}: ${response.statusText}`);
        }

        return response.json();
    },

    async deleteControl(id: number, mockUserId: number | null): Promise<void> {
        const response = await fetch(`${API_URL}/controls/${id}`, {
            method: 'DELETE',
            headers: await getHeaders(mockUserId),
        });

        if (!response.ok) {
            throw new Error(`Failed to delete control ${id}: ${response.statusText}`);
        }
    },

    async logExecution(controlId: number, data: ControlExecutionCreate, mockUserId: number | null): Promise<ControlExecution> {
        const response = await fetch(`${API_URL}/controls/${controlId}/executions`, {
            method: 'POST',
            headers: await getHeaders(mockUserId),
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error(`Failed to log execution for control ${controlId}: ${response.statusText}`);
        }

        return response.json();
    },

    async getExecutions(controlId: number, mockUserId: number | null): Promise<ControlExecution[]> {
        const response = await fetch(`${API_URL}/controls/${controlId}/executions`, {
            headers: await getHeaders(mockUserId),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch executions for control ${controlId}: ${response.statusText}`);
        }

        return response.json();
    },

    async getLinkedRisks(controlId: number, mockUserId: number | null): Promise<ControlRiskLink[]> {
        const response = await fetch(`${API_URL}/controls/${controlId}/risks`, {
            headers: await getHeaders(mockUserId),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch linked risks for control ${controlId}: ${response.statusText}`);
        }

        return response.json();
    },

    async linkRisk(
        controlId: number,
        data: { risk_id: number; effectiveness: ControlEffectiveness; notes?: string },
        mockUserId: number | null
    ): Promise<ControlRiskLink> {
        const response = await fetch(`${API_URL}/controls/${controlId}/risks`, {
            method: 'POST',
            headers: await getHeaders(mockUserId),
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Failed to link risk to control ${controlId}: ${response.statusText}`);
        }

        return response.json();
    },

    async unlinkRisk(controlId: number, riskId: number, mockUserId: number | null): Promise<void> {
        const response = await fetch(`${API_URL}/controls/${controlId}/risks/${riskId}`, {
            method: 'DELETE',
            headers: await getHeaders(mockUserId),
        });

        if (!response.ok) {
            throw new Error(`Failed to unlink risk ${riskId} from control ${controlId}: ${response.statusText}`);
        }
    }
};
