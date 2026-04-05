const DEFAULT_API_BASE_URL = 'http://localhost:8000';

export interface DemoTokenOptions {
    email: string;
    fallbackUserIds?: number[];
}

const DEMO_TOKEN_OPTIONS_BY_ACCOUNT_NAME: Record<string, DemoTokenOptions> = {
    'System Admin': { email: 'admin@riskhub.local', fallbackUserIds: [1] },
    'Anna Kowalski': { email: 'cro@riskhub.local', fallbackUserIds: [2] },
    'Petra Svobodová': { email: 'risk.manager@riskhub.local', fallbackUserIds: [3] },
    'Eva Králová': { email: 'ops.head@riskhub.local', fallbackUserIds: [4] },
    'Martin Procházka': { email: 'fin.head@riskhub.local', fallbackUserIds: [5] },
    'Tomáš Novotný': { email: 'it.head@riskhub.local', fallbackUserIds: [6] },
    'Jana Horáková': { email: 'ops.analyst@riskhub.local', fallbackUserIds: [7] },
    'Lukáš Dvořák': { email: 'fin.analyst@riskhub.local', fallbackUserIds: [8] },
    'Barbora Němcová': { email: 'it.analyst@riskhub.local', fallbackUserIds: [9] },
};

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

export interface KRILookup {
    id: number;
    is_archived?: boolean;
}

export interface NotificationLookup {
    id: number;
    type: string;
    title: string;
    message: string;
    is_read: boolean;
}

interface NotificationListResponse {
    items: NotificationLookup[];
    total: number;
    unread_count: number;
}

export function getApiBaseUrl(): string {
    return process.env.BACKEND_URL || DEFAULT_API_BASE_URL;
}

export async function getDemoTokenByAccountName(accountName: string): Promise<string> {
    const options = DEMO_TOKEN_OPTIONS_BY_ACCOUNT_NAME[accountName];
    if (!options) {
        throw new Error(`No demo token mapping defined for account '${accountName}'`);
    }
    return getDemoToken(options);
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
            body: JSON.stringify(candidate.body ?? {}),
        });
        if (!response.ok) continue;
        const data = await response.json() as { access_token?: string };
        if (data.access_token) return data.access_token;
    }

    throw new Error(`Failed to get API token for ${email} via demo-login endpoints`);
}

export async function listNotificationsByAccountName(accountName: string): Promise<NotificationLookup[]> {
    const apiBase = getApiBaseUrl();
    const token = await getDemoTokenByAccountName(accountName);
    const params = new URLSearchParams({
        skip: '0',
        limit: '50',
        unread_only: 'false',
    });
    const response = await fetch(`${apiBase}/api/v1/notifications?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`Failed to load notifications for '${accountName}': ${response.status}`);
    }
    const body = await response.json() as NotificationListResponse;
    return body.items;
}

export async function waitForNotificationByAccountName(
    accountName: string,
    matcher: (notification: NotificationLookup) => boolean,
    options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<NotificationLookup> {
    const timeoutMs = options.timeoutMs ?? 30000;
    const intervalMs = options.intervalMs ?? 1000;
    const deadline = Date.now() + timeoutMs;
    let lastNotifications: NotificationLookup[] = [];

    while (Date.now() < deadline) {
        lastNotifications = await listNotificationsByAccountName(accountName);
        const match = lastNotifications.find(matcher);
        if (match) {
            return match;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    const observed = lastNotifications.map(notification => `${notification.type}:${notification.title}`).join(', ') || 'none';
    throw new Error(`Timed out waiting for notification for '${accountName}'. Observed notifications: ${observed}`);
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

export async function getKRIByMetricName(metricName: string): Promise<KRILookup | null> {
    const apiBase = getApiBaseUrl();
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    const params = new URLSearchParams({
        search: metricName,
        include_archived: 'true',
        size: '50',
    });
    const response = await fetch(`${apiBase}/api/v1/kris?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`Failed to load KRIs for ${metricName}: ${response.status}`);
    }
    const body = await response.json() as { items: Array<{ id: number; metric_name: string; is_archived?: boolean }> };
    const kri = body.items.find((item) => item.metric_name === metricName);
    return kri ? { id: kri.id, is_archived: kri.is_archived } : null;
}

export async function linkVendorToRisk(vendorId: number, riskId: number): Promise<void> {
    const apiBase = getApiBaseUrl();
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    const response = await fetch(`${apiBase}/api/v1/vendors/${vendorId}/linked-risks`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ risk_id: riskId }),
    });
    if (!response.ok && response.status !== 400) {
        throw new Error(`Failed to link vendor ${vendorId} to risk ${riskId}: ${response.status}`);
    }
}

export async function linkVendorToControl(vendorId: number, controlId: number): Promise<void> {
    const apiBase = getApiBaseUrl();
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    const response = await fetch(`${apiBase}/api/v1/vendors/${vendorId}/linked-controls`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ control_id: controlId }),
    });
    if (!response.ok && response.status !== 400) {
        throw new Error(`Failed to link vendor ${vendorId} to control ${controlId}: ${response.status}`);
    }
}

export async function linkVendorToKRI(vendorId: number, kriId: number): Promise<void> {
    const apiBase = getApiBaseUrl();
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    const response = await fetch(`${apiBase}/api/v1/vendors/${vendorId}/linked-kris`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ kri_id: kriId }),
    });
    if (!response.ok && response.status !== 400) {
        throw new Error(`Failed to link vendor ${vendorId} to KRI ${kriId}: ${response.status}`);
    }
}

export async function unlinkVendorFromKRI(vendorId: number, kriId: number): Promise<void> {
    const apiBase = getApiBaseUrl();
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    const response = await fetch(`${apiBase}/api/v1/vendors/${vendorId}/linked-kris/${kriId}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to unlink vendor ${vendorId} from KRI ${kriId}: ${response.status}`);
    }
}

export async function setVendorFlags(
    vendorId: number,
    flags: {
        dora_relevant: boolean;
        supports_important_core_insurance_function: boolean;
        is_significant_vendor: boolean;
    },
): Promise<void> {
    const apiBase = getApiBaseUrl();
    const token = await getDemoToken({ email: 'risk.manager@riskhub.local', fallbackUserIds: [3] });
    const response = await fetch(`${apiBase}/api/v1/vendors/${vendorId}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(flags),
    });
    if (!response.ok) {
        throw new Error(`Failed to update vendor flags for ${vendorId}: ${response.status}`);
    }
}
