import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '@/services/api/ApiClientCore';
import { buildPreparedRequest, buildUrl } from '@/services/api/apiRequestBuilder';
import { API_URL, setApiRuntimeOrigin } from '@/services/api/apiConfig';
import { z } from '@/services/api/schemas';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';

describe('apiClient request builder', () => {
    beforeEach(() => {
        clearAccessToken();
        setApiRuntimeOrigin(window.location.origin);
    });

    it('builds query strings from scalar and array params', () => {
        const url = buildUrl(API_URL, '/reports', {
            search: 'claims',
            status: 'active',
            tags: ['a', 'b'],
            include_archived: false,
            empty: null,
        });

        expect(url.pathname).toBe('/api/v1/reports');
        expect(url.searchParams.get('search')).toBe('claims');
        expect(url.searchParams.get('status')).toBe('active');
        expect(url.searchParams.get('include_archived')).toBe('false');
        expect(url.searchParams.getAll('tags')).toEqual(['a', 'b']);
        expect(url.searchParams.has('empty')).toBe(false);
    });

    it('uses the configured runtime origin for relative API bases', () => {
        setApiRuntimeOrigin('https://api.example.test');

        const url = buildUrl(API_URL, '/reports');

        expect(url.origin).toBe('https://api.example.test');
        expect(url.pathname).toBe('/api/v1/reports');
    });

    it('adds auth and JSON headers for mutating requests', () => {
        setAccessToken('riskhub-jwt');

        const prepared = buildPreparedRequest(API_URL, '/vendors', {
            method: 'POST',
            body: JSON.stringify({ name: 'Vendor' }),
        });

        const headers = prepared.init.headers as Headers;
        expect(prepared.pathname).toBe('/api/v1/vendors');
        expect(headers.get('Authorization')).toBe('Bearer riskhub-jwt');
        expect(headers.get('Content-Type')).toBe('application/json');
        expect(prepared.init.credentials).toBe('include');
    });

    it('sets a JSON content type and preserves a string body for DELETE requests', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);
        const body = JSON.stringify({ reason: 'Accountability reassignment' });
        const client = new ApiClient(API_URL);

        await client.delete('/assets/8/accountability', {
            body,
            schema: z.object({ ok: z.boolean() }),
        });

        expect(fetchMock).toHaveBeenCalledOnce();
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = init.headers as Headers;
        expect(init.method).toBe('DELETE');
        expect(headers.get('Content-Type')).toBe('application/json');
        expect(init.body).toBe(body);
    });

    it('keeps runtime timeout overrides out of the fetch init payload', () => {
        const prepared = buildPreparedRequest(API_URL, '/reports', {
            method: 'GET',
            timeoutMs: null,
        });

        expect(prepared.timeoutMs).toBeNull();
        expect('timeoutMs' in prepared.init).toBe(false);
    });
});
