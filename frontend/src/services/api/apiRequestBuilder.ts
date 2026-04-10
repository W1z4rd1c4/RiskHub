import { getSessionSnapshot } from '@/services/session/store';

import { getApiRuntimeOrigin } from './apiConfig';
import type { PreparedRequest, QueryValue, RequestOptions } from './apiTypes';

function appendQueryParam(url: URL, key: string, rawValue: QueryValue): void {
    if (rawValue === undefined || rawValue === null) return;
    if (Array.isArray(rawValue)) {
        rawValue.forEach((value) => appendQueryParam(url, key, value));
        return;
    }
    if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
        url.searchParams.append(key, String(rawValue));
    }
}

export function buildUrl(baseUrl: string, endpoint: string, params?: RequestOptions['params']): URL {
    const baseOrigin = baseUrl.startsWith('/') ? getApiRuntimeOrigin() : '';
    const url = new URL(`${baseOrigin}${baseUrl}${endpoint}`);

    if (!params) {
        return url;
    }

    if (params instanceof URLSearchParams) {
        params.forEach((value, key) => {
            url.searchParams.append(key, value);
        });
        return url;
    }

    Object.entries(params).forEach(([key, value]) => {
        appendQueryParam(url, key, value);
    });
    return url;
}

export function buildPreparedRequest(
    baseUrl: string,
    endpoint: string,
    options: RequestOptions & { schema?: unknown } = {},
): PreparedRequest {
    const { params, schema: _schema, timeoutMs, ...init } = options;
    const url = buildUrl(baseUrl, endpoint, params);
    const headers = new Headers(init.headers);
    const token = getSessionSnapshot().token;
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    if (
        !headers.has('Content-Type')
        && (init.method === 'POST' || init.method === 'PUT' || init.method === 'PATCH')
    ) {
        headers.set('Content-Type', 'application/json');
    }

    return {
        url,
        pathname: url.pathname,
        init: { ...init, headers, credentials: 'include' },
        timeoutMs,
    };
}
