import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/ssoSession', () => ({
    silentReauthAndExchange: vi.fn(async () => {
        localStorage.setItem('access_token', 'refreshed-token');
        return 'refreshed-token';
    }),
}));

import { http, HttpResponse } from 'msw';

import { server } from '@test/mocks/server';
import { apiClient } from '@/services/apiClient';
import { silentReauthAndExchange } from '@/services/ssoSession';

describe('apiClient 401 recovery', () => {
    it('attempts silent reauth once and retries the request', async () => {
        let calls = 0;
        let secondAuthHeader: string | null = null;

        server.use(
            http.get('*/api/v1/test-401', ({ request }) => {
                calls += 1;
                if (calls === 1) {
                    return new HttpResponse(null, { status: 401 });
                }
                secondAuthHeader = request.headers.get('authorization');
                return HttpResponse.json({ ok: true });
            }),
        );

        const response = await apiClient.get<{ ok: boolean }>('/test-401');
        expect(response.ok).toBe(true);
        expect(silentReauthAndExchange).toHaveBeenCalledTimes(1);
        expect(secondAuthHeader).toBe('Bearer refreshed-token');
    });
});

