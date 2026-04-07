import { clearAccessToken } from '@test/accessTokenStoreHarness';
import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('@/services/ssoSession', () => ({
    silentReauthAndExchange: vi.fn(async () => {
        const { setAccessToken } = await import('@test/accessTokenStoreHarness');
        setAccessToken('refreshed-token');
        return 'refreshed-token';
    }),
}));

import { http, HttpResponse } from 'msw';

import { server } from '@test/mocks/server';
import { apiClient } from '@/services/apiClient';
import { silentReauthAndExchange } from '@/services/ssoSession';

describe('apiClient 401 recovery', () => {
    beforeEach(() => {
        clearAccessToken();
        vi.clearAllMocks();
    });

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

    it('does not redirect the browser when silent reauth fails', async () => {
        vi.mocked(silentReauthAndExchange).mockResolvedValueOnce(null);

        server.use(
            http.get('*/api/v1/test-401-fail', () => new HttpResponse(null, { status: 401 })),
        );

        const originalHref = window.location.href;

        await expect(apiClient.get('/test-401-fail')).rejects.toMatchObject({ status: 401 });
        expect(window.location.href).toBe(originalHref);
    });

    it('retries blob downloads through the same 401 recovery path', async () => {
        let calls = 0;
        let secondAuthHeader: string | null = null;

        server.use(
            http.get('*/api/v1/test-blob-401', ({ request }) => {
                calls += 1;
                if (calls === 1) {
                    return new HttpResponse(null, { status: 401 });
                }
                secondAuthHeader = request.headers.get('authorization');
                return new HttpResponse('csv-data', {
                    status: 200,
                    headers: { 'Content-Type': 'text/csv' },
                });
            }),
        );

        const response = await apiClient.getBlob('/test-blob-401');
        expect(response.blob).toBeInstanceOf(Blob);
        expect(response.blob.type).toBe('text/csv');
        expect(silentReauthAndExchange).toHaveBeenCalledTimes(1);
        expect(secondAuthHeader).toBe('Bearer refreshed-token');
    });
});
