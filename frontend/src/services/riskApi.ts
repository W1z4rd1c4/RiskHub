import type {
    Risk,
    RiskSummary,
    RiskCreate,
    RiskUpdate,
    RiskControlLink,
    RiskType,
    RiskStatus,
    ControlEffectiveness
} from '@/types/risk';

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

export const riskApi = {
    async getRisks(params: {
        skip?: number;
        limit?: number;
        department_id?: number;
        status?: RiskStatus;
        risk_type?: RiskType;
        is_priority?: boolean;
        search?: string;
        mockUserId: number | null;
    }): Promise<RiskSummary[]> {
        const { mockUserId, ...queryParams } = params;
        const searchParams = new URLSearchParams();
        Object.entries(queryParams).forEach(([key, value]) => {
            if (value !== undefined) searchParams.append(key, String(value));
        });

        const response = await fetch(`${API_URL}/risks?${searchParams.toString()}`, {
            headers: await getHeaders(mockUserId),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch risks: ${response.statusText}`);
        }

        return response.json();
    },

    async getRisk(id: number, mockUserId: number | null): Promise<Risk> {
        const response = await fetch(`${API_URL}/risks/${id}`, {
            headers: await getHeaders(mockUserId),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch risk ${id}: ${response.statusText}`);
        }

        return response.json();
    },

    async createRisk(data: RiskCreate, mockUserId: number | null): Promise<Risk> {
        const response = await fetch(`${API_URL}/risks`, {
            method: 'POST',
            headers: await getHeaders(mockUserId),
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Failed to create risk: ${response.statusText}`);
        }

        return response.json();
    },

    async updateRisk(id: number, data: RiskUpdate, mockUserId: number | null): Promise<Risk> {
        const response = await fetch(`${API_URL}/risks/${id}`, {
            method: 'PATCH',
            headers: await getHeaders(mockUserId),
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Failed to update risk ${id}: ${response.statusText}`);
        }

        return response.json();
    },

    async deleteRisk(id: number, mockUserId: number | null): Promise<void> {
        const response = await fetch(`${API_URL}/risks/${id}`, {
            method: 'DELETE',
            headers: await getHeaders(mockUserId),
        });

        if (!response.ok) {
            throw new Error(`Failed to delete risk ${id}: ${response.statusText}`);
        }
    },

    async getLinkedControls(riskId: number, mockUserId: number | null): Promise<RiskControlLink[]> {
        const response = await fetch(`${API_URL}/risks/${riskId}/controls`, {
            headers: await getHeaders(mockUserId),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch linked controls for risk ${riskId}: ${response.statusText}`);
        }

        return response.json();
    },

    async linkControl(
        riskId: number,
        data: { control_id: number; effectiveness: ControlEffectiveness; notes?: string },
        mockUserId: number | null
    ): Promise<RiskControlLink> {
        const response = await fetch(`${API_URL}/risks/${riskId}/controls`, {
            method: 'POST',
            headers: await getHeaders(mockUserId),
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Failed to link control to risk ${riskId}: ${response.statusText}`);
        }

        return response.json();
    },

    async unlinkControl(riskId: number, controlId: number, mockUserId: number | null): Promise<void> {
        const response = await fetch(`${API_URL}/risks/${riskId}/controls/${controlId}`, {
            method: 'DELETE',
            headers: await getHeaders(mockUserId),
        });

        if (!response.ok) {
            throw new Error(`Failed to unlink control ${controlId} from risk ${riskId}: ${response.statusText}`);
        }
    },
};
