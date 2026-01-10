/**
 * E2E Test Data Helpers
 *
 * API-based helpers for creating and cleaning up test data.
 * Use these for tests that need specific data state.
 */

import { Page } from '@playwright/test';

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
 * Get auth token for API calls by logging in as admin
 */
async function getAdminToken(): Promise<string> {
    const response = await fetch(`${API_BASE}/api/v1/auth/demo-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@riskhub.local' }),
    });

    if (!response.ok) {
        throw new Error(`Failed to get admin token: ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
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
