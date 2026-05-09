import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureControlStatus, ensureRiskStatus, ensureVendorStatus } from '../../../e2e/helpers/api-auth';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function emptyResponse(status = 204): Response {
    return new Response(null, { status });
}

describe('E2E API archive-state helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('verifies archived risks through is_archived after archive mutation', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const url = String(input);
            if (url.endsWith('/api/v1/auth/config')) {
                return jsonResponse({ demo_login_enabled: true, auth_mode: 'hybrid_dev' });
            }
            if (url.endsWith('/api/v1/auth/demo-login') && init?.method === 'POST') {
                return jsonResponse({ access_token: 'demo-token' });
            }
            if (url.includes('/api/v1/risks?')) {
                const archived = fetchMock.mock.calls.some(([calledUrl, calledInit]) =>
                    String(calledUrl).includes('/api/v1/risks/77?') && calledInit?.method === 'DELETE',
                );
                return jsonResponse({
                    items: [
                        {
                            id: 77,
                            risk_id_code: 'R-E2E-ARCHIVE',
                            status: 'active',
                            is_archived: archived,
                        },
                    ],
                });
            }
            if (url.includes('/api/v1/risks/77?') && init?.method === 'DELETE') {
                return emptyResponse();
            }
            throw new Error(`Unexpected fetch call: ${url}`);
        });

        await expect(ensureRiskStatus('R-E2E-ARCHIVE', 'archived')).resolves.toBe(77);
    });

    it('verifies archived controls through is_archived after archive mutation', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const url = String(input);
            if (url.endsWith('/api/v1/auth/config')) {
                return jsonResponse({ demo_login_enabled: true, auth_mode: 'hybrid_dev' });
            }
            if (url.endsWith('/api/v1/auth/demo-login') && init?.method === 'POST') {
                return jsonResponse({ access_token: 'demo-token' });
            }
            if (url.includes('/api/v1/controls?')) {
                const archived = fetchMock.mock.calls.some(([calledUrl, calledInit]) =>
                    String(calledUrl).includes('/api/v1/controls/88?') && calledInit?.method === 'DELETE',
                );
                return jsonResponse({
                    items: [
                        {
                            id: 88,
                            name: 'E2E Archive Control',
                            status: 'active',
                            is_archived: archived,
                        },
                    ],
                });
            }
            if (url.includes('/api/v1/controls/88?') && init?.method === 'DELETE') {
                return emptyResponse();
            }
            throw new Error(`Unexpected fetch call: ${url}`);
        });

        await expect(ensureControlStatus('E2E Archive Control', 'archived')).resolves.toBe(88);
    });

    it('treats archived vendors as inactive without issuing a duplicate archive request', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const url = String(input);
            if (url.endsWith('/api/v1/auth/config')) {
                return jsonResponse({ demo_login_enabled: true, auth_mode: 'hybrid_dev' });
            }
            if (url.endsWith('/api/v1/auth/demo-login') && init?.method === 'POST') {
                return jsonResponse({ access_token: 'demo-token' });
            }
            if (url.includes('/api/v1/vendors?')) {
                return jsonResponse({
                    items: [
                        {
                            id: 99,
                            registration_id: 'V-E2E-ARCHIVED',
                            status: 'active',
                            is_archived: true,
                        },
                    ],
                });
            }
            if (url.includes('/api/v1/vendors/99') && init?.method === 'DELETE') {
                throw new Error('Archived vendor should not be archived again');
            }
            throw new Error(`Unexpected fetch call: ${url}`);
        });

        await expect(ensureVendorStatus('V-E2E-ARCHIVED', 'inactive')).resolves.toBe(99);
    });
});
