import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, apiClient } from '@/services/apiClient';

describe('apiClient error helpers', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns UI message keys and raw messages for ApiClientError instances', () => {
        const error = new ApiClientError({
            status: 400,
            code: 'REQUEST_FAILED',
            messageKey: 'errorKeys.request_failed',
            rawMessage: 'Request failed',
        });

        expect(apiClient.toUiMessageKey(error)).toBe('errorKeys.request_failed');
        expect(apiClient.getRawErrorMessage(error)).toBe('Request failed');
    });

    it('wraps network failures as ApiClientError instances', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket closed')));

        await expect(apiClient.get('/network-failure')).rejects.toMatchObject({
            name: 'ApiClientError',
            code: 'NETWORK_ERROR',
            rawMessage: 'socket closed',
        });
    });
});
