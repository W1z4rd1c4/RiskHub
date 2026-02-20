const DEFAULT_API_BASE_URL = 'http://localhost:8000';

export interface DemoTokenOptions {
    email: string;
    fallbackUserIds?: number[];
}

export interface VendorLookup {
    id: number;
    status: string;
}

export interface RiskLookup {
    id: number;
    status: string;
}

export interface ControlLookup {
    id: number;
    status: string;
}

export function getApiBaseUrl(): string {
    return process.env.BACKEND_URL || DEFAULT_API_BASE_URL;
}

export async function getDemoToken(options: DemoTokenOptions): Promise<string> {
    const { email, fallbackUserIds = [] } = options;
    const apiBase = getApiBaseUrl();

    // Preflight: demo login is only available in hybrid dev mode.
    try {
        const res = await fetch(`${apiBase}/api/v1/auth/config`);
        if (res.ok) {
            const body = await res.json() as { demo_login_enabled?: unknown; auth_mode?: unknown };
            if (body && typeof body === 'object' && body.demo_login_enabled === false) {
                throw new Error(
                    `Demo login is disabled (auth_mode=${String(body.auth_mode)}). ` +
                    'Start backend with AUTH_MODE=hybrid_dev and demo auth enabled.',
                );
            }
        }
    } catch (e) {
        // If the config endpoint is unavailable or returns an unexpected response, fall back
        // to probing the demo-login endpoints directly.
        if (e instanceof Error && e.message.startsWith('Demo login is disabled')) {
            throw e;
        }
    }

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

export async function getRiskByCode(code: string): Promise<RiskLookup | null> {
    const apiBase = getApiBaseUrl();
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    const params = new URLSearchParams({
        search: code,
        include_archived: 'true',
        limit: '50',
    });
    const response = await fetch(`${apiBase}/api/v1/risks?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`Failed to load risks for ${code}: ${response.status}`);
    }
    const body = await response.json() as { items: Array<{ id: number; risk_id_code: string; status: string }> };
    const risk = body.items.find((item) => item.risk_id_code === code);
    return risk ? { id: risk.id, status: risk.status } : null;
}

export async function ensureRiskStatus(code: string, status: 'active' | 'archived'): Promise<number> {
    const apiBase = getApiBaseUrl();
    const risk = await getRiskByCode(code);
    if (!risk) {
        throw new Error(`Risk ${code} not found`);
    }

    if (risk.status === status) {
        return risk.id;
    }

    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    if (status === 'archived') {
        const params = new URLSearchParams({ reason: 'E2E: ensure archived state' });
        const archiveResponse = await fetch(`${apiBase}/api/v1/risks/${risk.id}?${params.toString()}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!archiveResponse.ok && archiveResponse.status !== 204) {
            throw new Error(`Failed to archive risk ${risk.id}: ${archiveResponse.status}`);
        }
    } else {
        const restoreResponse = await fetch(`${apiBase}/api/v1/risks/${risk.id}/restore`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        if (!restoreResponse.ok) {
            throw new Error(`Failed to restore risk ${risk.id}: ${restoreResponse.status}`);
        }
    }

    const updated = await getRiskByCode(code);
    if (!updated) {
        throw new Error(`Risk ${code} not found after status update`);
    }
    if (updated.status !== status) {
        throw new Error(`Risk ${code} expected status=${status} but got status=${updated.status}`);
    }

    return risk.id;
}

export async function getControlByName(name: string): Promise<ControlLookup | null> {
    const apiBase = getApiBaseUrl();
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    const params = new URLSearchParams({
        search: name,
        include_archived: 'true',
        limit: '50',
    });
    const response = await fetch(`${apiBase}/api/v1/controls?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`Failed to load controls for ${name}: ${response.status}`);
    }
    const body = await response.json() as { items: Array<{ id: number; name: string; status: string }> };
    const control = body.items.find((item) => item.name === name);
    return control ? { id: control.id, status: control.status } : null;
}

export async function ensureControlStatus(name: string, status: 'active' | 'archived'): Promise<number> {
    const apiBase = getApiBaseUrl();
    const control = await getControlByName(name);
    if (!control) {
        throw new Error(`Control '${name}' not found`);
    }

    if (control.status === status) {
        return control.id;
    }

    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    if (status === 'archived') {
        const params = new URLSearchParams({ reason: 'E2E: ensure archived state' });
        const archiveResponse = await fetch(`${apiBase}/api/v1/controls/${control.id}?${params.toString()}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!archiveResponse.ok && archiveResponse.status !== 204) {
            throw new Error(`Failed to archive control ${control.id}: ${archiveResponse.status}`);
        }
    } else {
        const restoreResponse = await fetch(`${apiBase}/api/v1/controls/${control.id}/restore`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        if (!restoreResponse.ok) {
            throw new Error(`Failed to restore control ${control.id}: ${restoreResponse.status}`);
        }
    }

    const updated = await getControlByName(name);
    if (!updated) {
        throw new Error(`Control '${name}' not found after status update`);
    }
    if (updated.status !== status) {
        throw new Error(`Control '${name}' expected status=${status} but got status=${updated.status}`);
    }

    return control.id;
}
