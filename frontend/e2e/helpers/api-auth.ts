const DEFAULT_API_BASE_URL = 'http://localhost:8000';

export interface DemoTokenOptions {
    email: string;
    fallbackUserIds?: number[];
}

export interface VendorLookup {
    id: number;
    status: string;
}

export function getApiBaseUrl(): string {
    return process.env.BACKEND_URL || DEFAULT_API_BASE_URL;
}

export async function getDemoToken(options: DemoTokenOptions): Promise<string> {
    const { email, fallbackUserIds = [] } = options;
    const apiBase = getApiBaseUrl();
    const candidates: Array<{ url: string; body?: Record<string, string> }> = [
        { url: `${apiBase}/api/v1/auth/demo-login`, body: { email } },
        ...fallbackUserIds.map((id) => ({ url: `${apiBase}/api/v1/auth/demo-login/${id}` })),
    ];

    for (const candidate of candidates) {
        const response = await fetch(candidate.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            ...(candidate.body ? { body: JSON.stringify(candidate.body) } : {}),
        });
        if (!response.ok) continue;
        const data = await response.json() as { access_token?: string };
        if (data.access_token) return data.access_token;
    }

    throw new Error(`Failed to get API token for ${email} via demo-login endpoints`);
}

export async function getVendorByRegistration(registrationId: string): Promise<VendorLookup | null> {
    const apiBase = getApiBaseUrl();
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    const params = new URLSearchParams({
        search: registrationId,
        include_archived: 'true',
        limit: '50',
    });
    const response = await fetch(`${apiBase}/api/v1/vendors?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`Failed to load vendors for ${registrationId}: ${response.status}`);
    }
    const body = await response.json() as { items: Array<{ id: number; registration_id: string; status: string }> };
    const vendor = body.items.find((item) => item.registration_id === registrationId);
    return vendor ? { id: vendor.id, status: vendor.status } : null;
}

export async function ensureVendorStatus(registrationId: string, status: 'active' | 'inactive'): Promise<number> {
    const apiBase = getApiBaseUrl();
    const vendor = await getVendorByRegistration(registrationId);
    if (!vendor) {
        throw new Error(`Vendor ${registrationId} not found`);
    }

    if (vendor.status === status) {
        return vendor.id;
    }

    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    if (status === 'inactive') {
        const archiveResponse = await fetch(`${apiBase}/api/v1/vendors/${vendor.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!(archiveResponse.ok || archiveResponse.status === 204)) {
            throw new Error(`Failed to archive vendor ${vendor.id}: ${archiveResponse.status}`);
        }
    } else {
        const restoreResponse = await fetch(`${apiBase}/api/v1/vendors/${vendor.id}/restore`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        if (!restoreResponse.ok) {
            throw new Error(`Failed to restore vendor ${vendor.id}: ${restoreResponse.status}`);
        }
    }

    return vendor.id;
}
