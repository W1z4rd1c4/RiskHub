import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, apiClient } from '@/services/apiClient';
import { toApiClientError } from '@/services/api/apiErrors';
import { RequestRuntimeError } from '@/services/api/requestRuntime';
import { z } from '@/services/api/schemas';

const okSchema = z.object({ ok: z.boolean() }).passthrough();

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

        await expect(apiClient.get('/network-failure', { schema: okSchema })).rejects.toMatchObject({
            name: 'ApiClientError',
            code: 'NETWORK_ERROR',
            rawMessage: 'socket closed',
        });
    });

    it('maps request timeouts to a timeout-specific UI key', () => {
        const error = toApiClientError(
            new RequestRuntimeError('REQUEST_TIMEOUT', 'Request timed out', 'Request timed out'),
        );

        expect(error).toMatchObject({
            code: 'REQUEST_TIMEOUT',
            messageKey: 'errorKeys.request_timeout',
            rawMessage: 'Request timed out',
        });
    });

    it('preserves caller aborts instead of converting them to timeout UI errors', async () => {
        const controller = new AbortController();
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((_input, init) => {
                controller.abort();
                return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
            }),
        );

        await expect(
            apiClient.get('/aborted', { schema: okSchema, signal: controller.signal }),
        ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('rejects malformed success payloads as invalid response payloads', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ ok: 'not-a-boolean' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
            ),
        );

        await expect(apiClient.get('/invalid-payload', { schema: okSchema })).rejects.toMatchObject({
            name: 'ApiClientError',
            code: 'INVALID_RESPONSE_PAYLOAD',
            messageKey: 'errorKeys.request_failed',
        });
    });

    it('rejects non-json success bodies as invalid response payloads', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response('<html>proxy error</html>', {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' },
                }),
            ),
        );

        await expect(apiClient.get('/html-payload', { schema: okSchema })).rejects.toMatchObject({
            code: 'INVALID_RESPONSE_PAYLOAD',
            messageKey: 'errorKeys.request_failed',
        });
    });

    it('returns undefined for empty 204 responses when the contract is void', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

        await expect(apiClient.delete('/no-content', { schema: z.void() })).resolves.toBeUndefined();
    });

    it('falls back to raw text for non-json error bodies', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response('upstream unavailable', {
                    status: 502,
                    headers: { 'Content-Type': 'text/plain' },
                }),
            ),
        );

        await expect(apiClient.get('/text-error', { schema: okSchema })).rejects.toMatchObject({
            rawMessage: 'upstream unavailable',
        });
    });
});
