/**
 * E2E Test Data Helpers
 *
 * API-based helpers for creating and cleaning up test data.
 * Use these for tests that need specific data state.
 */

import { Page } from '@playwright/test';
import { E2E_APPROVALS, E2E_REQUIRED_FIXTURES } from '../fixtures/e2e-data';

const API_BASE = process.env.BACKEND_URL || 'http://localhost:8000';

interface TestRisk {
    id?: number;
    name: string;
    description?: string;
    category?: string;
    department_id?: number;
    owner_id?: number;
    probability?: number;
    impact?: number;
}

interface TestControl {
    id?: number;
    name: string;
    description?: string;
    department_id?: number;
    control_owner_id?: number;
}

interface TestKRI {
    id?: number;
    name: string;
    description?: string;
    risk_id?: number;
    reporting_owner_id?: number;
    unit?: string;
    frequency?: string;
    lower_threshold?: number;
    upper_threshold?: number;
}

interface CleanupIds {
    risks?: number[];
    controls?: number[];
    kris?: number[];
}

/**
 * Get auth token for API calls by logging in as a privileged demo user.
 */
async function getTokenForEmail(email: string, fallbackUserIds: number[] = []): Promise<string> {
    // Prefer email-based demo login if available, then fallback to ID-based endpoint.
    const candidates: Array<{ url: string; body?: Record<string, string> }> = [
        {
            url: `${API_BASE}/api/v1/auth/demo-login`,
            body: { email },
        },
        ...fallbackUserIds.map((id) => ({ url: `${API_BASE}/api/v1/auth/demo-login/${id}` })),
    ];

    for (const candidate of candidates) {
        const response = await fetch(candidate.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            ...(candidate.body ? { body: JSON.stringify(candidate.body) } : {}),
        });

        if (!response.ok) {
            continue;
        }

        const data = await response.json() as { access_token?: string };
        if (data.access_token) {
            return data.access_token;
        }
    }

    throw new Error(`Failed to get demo token for ${email} via all supported demo-login endpoints`);
}

/**
 * Get auth token for API calls by logging in as a privileged demo user.
 */
async function getAdminToken(): Promise<string> {
    return getTokenForEmail('risk.manager@riskhub.local', [3, 1]);
}

/**
 * Create a test risk via API
 */
export async function createTestRisk(data: Partial<TestRisk>): Promise<TestRisk> {
    const token = await getAdminToken();

    const riskData: TestRisk = {
        name: data.name || `Test Risk ${Date.now()}`,
        description: data.description || 'E2E test risk',
        category: data.category || 'Operational',
        department_id: data.department_id || 1,
        probability: data.probability || 3,
        impact: data.impact || 3,
        ...data,
    };

    const response = await fetch(`${API_BASE}/api/v1/risks`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(riskData),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create test risk: ${response.status} - ${error}`);
    }

    return response.json();
}

/**
 * Create a test control via API
 */
export async function createTestControl(data: Partial<TestControl>): Promise<TestControl> {
    const token = await getAdminToken();

    const controlData: TestControl = {
        name: data.name || `Test Control ${Date.now()}`,
        description: data.description || 'E2E test control',
        department_id: data.department_id || 1,
        ...data,
    };

    const response = await fetch(`${API_BASE}/api/v1/controls`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(controlData),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create test control: ${response.status} - ${error}`);
    }

    return response.json();
}

/**
 * Create a test KRI via API
 */
export async function createTestKRI(data: Partial<TestKRI>): Promise<TestKRI> {
    const token = await getAdminToken();

    const kriData: TestKRI = {
        name: data.name || `Test KRI ${Date.now()}`,
        description: data.description || 'E2E test KRI',
        unit: data.unit || '%',
        frequency: data.frequency || 'monthly',
        lower_threshold: data.lower_threshold || 0,
        upper_threshold: data.upper_threshold || 100,
        ...data,
    };

    const response = await fetch(`${API_BASE}/api/v1/kris`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(kriData),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create test KRI: ${response.status} - ${error}`);
    }

    return response.json();
}

/**
 * Clean up test data created during tests
 */
export async function cleanupTestData(ids: CleanupIds): Promise<void> {
    const token = await getAdminToken();
    const errors: string[] = [];

    // Clean up KRIs first (they may depend on risks)
    if (ids.kris?.length) {
        for (const id of ids.kris) {
            try {
                await fetch(`${API_BASE}/api/v1/kris/${id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                });
            } catch (e) {
                errors.push(`KRI ${id}: ${e}`);
            }
        }
    }

    // Clean up controls
    if (ids.controls?.length) {
        for (const id of ids.controls) {
            try {
                await fetch(`${API_BASE}/api/v1/controls/${id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                });
            } catch (e) {
                errors.push(`Control ${id}: ${e}`);
            }
        }
    }

    // Clean up risks last
    if (ids.risks?.length) {
        for (const id of ids.risks) {
            try {
                await fetch(`${API_BASE}/api/v1/risks/${id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                });
            } catch (e) {
                errors.push(`Risk ${id}: ${e}`);
            }
        }
    }

    if (errors.length > 0) {
        console.warn('Cleanup warnings:', errors);
    }
}

/**
 * Extract auth token from page context (for tests that need API calls mid-test)
 */
export async function getTokenFromPage(page: Page): Promise<string | null> {
    return page.evaluate(() => {
        return localStorage.getItem('access_token');
    });
}

interface DeterministicPreflightResult {
    ok: boolean;
    missing: string[];
    counts: {
        risks: number;
        controls: number;
        kris: number;
        vendors: number;
        vendor_slas: number;
        approvals_pending: number;
        approvals_my_requests: number;
    };
}

/**
 * Validate that deterministic seed data required by Phase 179/180 exists.
 * Fails fast on fresh DBs that were not seeded with E2E fixtures.
 */
export async function verifyDeterministicE2EData(): Promise<DeterministicPreflightResult> {
    const riskManagerToken = await getTokenForEmail('risk.manager@riskhub.local', [3, 1]);
    const employeeToken = await getTokenForEmail('ops.analyst@riskhub.local', [7]);
    const riskManagerHeaders = { Authorization: `Bearer ${riskManagerToken}` };
    const employeeHeaders = { Authorization: `Bearer ${employeeToken}` };

    const [risksRes, controlsRes, krisRes, vendorsRes, slasRes, approvalsPendingRes, approvalsMineRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/risks?include_archived=true&limit=100&search=E2E-`, { headers: riskManagerHeaders }),
        fetch(`${API_BASE}/api/v1/controls?include_archived=true&limit=100&search=E2E-`, { headers: riskManagerHeaders }),
        fetch(`${API_BASE}/api/v1/kris?include_archived=true&page=1&size=200&search=E2E-`, { headers: riskManagerHeaders }),
        fetch(`${API_BASE}/api/v1/vendors?include_archived=true&limit=100&search=E2E-VREG`, { headers: riskManagerHeaders }),
        fetch(`${API_BASE}/api/v1/vendor-slas?include_archived=true`, { headers: riskManagerHeaders }),
        fetch(`${API_BASE}/api/v1/approvals?status=pending&limit=100`, { headers: riskManagerHeaders }),
        fetch(`${API_BASE}/api/v1/approvals?status=pending&limit=100&my_requests=true`, { headers: employeeHeaders }),
    ]);

    const failures: string[] = [];
    if (!risksRes.ok) failures.push(`Failed to fetch risks: HTTP ${risksRes.status}`);
    if (!controlsRes.ok) failures.push(`Failed to fetch controls: HTTP ${controlsRes.status}`);
    if (!krisRes.ok) failures.push(`Failed to fetch KRIs: HTTP ${krisRes.status}`);
    if (!vendorsRes.ok) failures.push(`Failed to fetch vendors: HTTP ${vendorsRes.status}`);
    if (!slasRes.ok) failures.push(`Failed to fetch vendor SLAs: HTTP ${slasRes.status}`);
    if (!approvalsPendingRes.ok) failures.push(`Failed to fetch pending approvals queue: HTTP ${approvalsPendingRes.status}`);
    if (!approvalsMineRes.ok) failures.push(`Failed to fetch employee pending approvals: HTTP ${approvalsMineRes.status}`);

    if (failures.length > 0) {
        return {
            ok: false,
            missing: failures,
            counts: { risks: 0, controls: 0, kris: 0, vendors: 0, vendor_slas: 0, approvals_pending: 0, approvals_my_requests: 0 },
        };
    }

    const risksBody = await risksRes.json() as { items: Array<{ risk_id_code?: string }> };
    const controlsBody = await controlsRes.json() as { items: Array<{ name?: string }> };
    const krisBody = await krisRes.json() as { items: Array<{ metric_name?: string }> };
    const vendorsBody = await vendorsRes.json() as { items: Array<{ registration_id?: string }> };
    const slasBody = await slasRes.json() as Array<{ metric_name?: string }>;
    const approvalsPendingBody = await approvalsPendingRes.json() as { items: Array<{ reason?: string; status?: string }> };
    const approvalsMineBody = await approvalsMineRes.json() as { items: Array<{ reason?: string; status?: string }> };

    const riskCodes = new Set(risksBody.items.map((item) => item.risk_id_code).filter(Boolean));
    const controlNames = new Set(controlsBody.items.map((item) => item.name).filter(Boolean));
    const kriNames = new Set(krisBody.items.map((item) => item.metric_name).filter(Boolean));
    const vendorRegistrations = new Set(vendorsBody.items.map((item) => item.registration_id).filter(Boolean));
    const slaNames = new Set(slasBody.map((item) => item.metric_name).filter(Boolean));
    const queueApprovals = approvalsPendingBody.items;
    const myApprovals = approvalsMineBody.items;

    const missing: string[] = [];
    for (const code of E2E_REQUIRED_FIXTURES.risks) {
        if (!riskCodes.has(code)) missing.push(`risk:${code}`);
    }
    for (const name of E2E_REQUIRED_FIXTURES.controls) {
        if (!controlNames.has(name)) missing.push(`control:${name}`);
    }
    for (const name of E2E_REQUIRED_FIXTURES.kris) {
        if (!kriNames.has(name)) missing.push(`kri:${name}`);
    }
    for (const registration of E2E_REQUIRED_FIXTURES.vendors) {
        if (!vendorRegistrations.has(registration)) missing.push(`vendor:${registration}`);
    }
    for (const name of E2E_REQUIRED_FIXTURES.vendor_slas) {
        if (!slaNames.has(name)) missing.push(`vendor_sla:${name}`);
    }

    const expectedQueueApprovals = [
        E2E_APPROVALS.PENDING_RISK_DELETE,
        E2E_APPROVALS.PENDING_PRIORITY_DELETE,
        E2E_APPROVALS.PENDING_PRIVILEGED_EDIT,
        E2E_APPROVALS.PENDING_CONTROL_DELETE,
    ];

    for (const expectedApproval of expectedQueueApprovals) {
        const found = queueApprovals.some(
            (item) =>
                item.reason === expectedApproval.reason &&
                String(item.status || '').toLowerCase() === expectedApproval.status,
        );
        if (!found) {
            missing.push(`approval_queue:${expectedApproval.reason}`);
        }
    }

    const employeeRequestFound = myApprovals.some(
        (item) =>
            item.reason === E2E_APPROVALS.PENDING_RISK_DELETE.reason &&
            String(item.status || '').toLowerCase() === E2E_APPROVALS.PENDING_RISK_DELETE.status,
    );
    if (!employeeRequestFound) {
        missing.push(`approval_my_requests:${E2E_APPROVALS.PENDING_RISK_DELETE.reason}`);
    }

    return {
        ok: missing.length === 0,
        missing,
        counts: {
            risks: risksBody.items.length,
            controls: controlsBody.items.length,
            kris: krisBody.items.length,
            vendors: vendorsBody.items.length,
            vendor_slas: slasBody.length,
            approvals_pending: queueApprovals.length,
            approvals_my_requests: myApprovals.length,
        },
    };
}
