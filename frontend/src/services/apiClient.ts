import { getErrorMessageKey } from '@/i18n/getErrorMessageKey';
import { silentReauthAndExchange } from '@/services/ssoSession';

// Use relative URL for nginx proxy (enables LAN access)
// In development, VITE_API_URL can override for direct backend connection
const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

type QueryScalar = string | number | boolean;
type QueryValue = QueryScalar | QueryScalar[] | null | undefined;
type QueryParams = URLSearchParams | object;

interface RequestOptions extends RequestInit {
    params?: QueryParams;
}

export interface ApiClientErrorPayload {
    status?: number;
    code?: string;
    messageKey: string;
    rawMessage?: string;
}

export class ApiClientError extends Error {
    status?: number;
    code?: string;
    messageKey: string;
    rawMessage?: string;

    constructor(payload: ApiClientErrorPayload) {
        super(payload.messageKey);
        this.name = 'ApiClientError';
        this.status = payload.status;
        this.code = payload.code;
        this.messageKey = payload.messageKey;
        this.rawMessage = payload.rawMessage;
    }
}

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private shouldAttemptSilentReauth(pathname: string, attempt: number): boolean {
        if (attempt > 0) return false;
        // Avoid infinite loops / recursion around auth endpoints.
        if (pathname.startsWith('/api/v1/auth/')) return false;
        return true;
    }

    private appendQueryParam(url: URL, key: string, rawValue: QueryValue): void {
        if (rawValue === undefined || rawValue === null) return;
        if (Array.isArray(rawValue)) {
            rawValue.forEach((value) => this.appendQueryParam(url, key, value));
            return;
        }
        if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
            url.searchParams.append(key, String(rawValue));
        }
    }

    private buildUrl(endpoint: string, params?: RequestOptions['params']): URL {
        const baseOrigin = this.baseUrl.startsWith('/') ? window.location.origin : '';
        const url = new URL(`${baseOrigin}${this.baseUrl}${endpoint}`);
        if (params) {
            if (params instanceof URLSearchParams) {
                params.forEach((value, key) => {
                    url.searchParams.append(key, value);
                });
                return url;
            }

            Object.entries(params as Record<string, QueryValue>).forEach(([key, value]) => {
                this.appendQueryParam(url, key, value);
            });
        }
        return url;
    }

    private parseErrorMessage(errorData: unknown, status: number): string {
        if (!errorData || typeof errorData !== 'object') {
            return `Request failed with status ${status}`;
        }

        const detail = (errorData as { detail?: unknown }).detail;
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail)) {
            return detail
                .map((e) => {
                    if (typeof e === 'string') return e;
                    if (e && typeof e === 'object') {
                        const row = e as { msg?: string; message?: string };
                        return row.msg || row.message || JSON.stringify(e);
                    }
                    return String(e);
                })
                .join('; ');
        }
        if (detail) return JSON.stringify(detail);

        return `Request failed with status ${status}`;
    }

    private toApiClientError(error: unknown): ApiClientError {
        if (error instanceof ApiClientError) return error;

        return new ApiClientError({
            code: 'NETWORK_ERROR',
            messageKey: getErrorMessageKey('NETWORK_ERROR'),
            rawMessage: error instanceof Error ? error.message : String(error),
        });
    }

    private async request<T>(endpoint: string, options: RequestOptions = {}, attempt = 0): Promise<T> {
        const { params, ...init } = options;
        const url = this.buildUrl(endpoint, params);
        const pathname = url.pathname;

        const headers = new Headers(init.headers);
        const token = localStorage.getItem('access_token');
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        if (!headers.has('Content-Type') && (init.method === 'POST' || init.method === 'PUT' || init.method === 'PATCH')) {
            headers.set('Content-Type', 'application/json');
        }

        try {
            const response = await fetch(url.toString(), { ...init, headers, credentials: 'include' });

            if (response.status === 401) {
                if (this.shouldAttemptSilentReauth(pathname, attempt)) {
                    const refreshedToken = await silentReauthAndExchange();
                    if (refreshedToken) {
                        return this.request<T>(endpoint, options, attempt + 1);
                    }
                }

                localStorage.removeItem('access_token');
                window.location.href = '/login';
                throw new ApiClientError({
                    status: 401,
                    code: 'UNAUTHORIZED',
                    messageKey: getErrorMessageKey('UNAUTHORIZED', 401),
                    rawMessage: 'Unauthorized',
                });
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const code = typeof (errorData as { code?: unknown }).code === 'string'
                    ? String((errorData as { code: string }).code)
                    : typeof (errorData as { error_code?: unknown }).error_code === 'string'
                        ? String((errorData as { error_code: string }).error_code)
                        : undefined;

                const rawMessage = this.parseErrorMessage(errorData, response.status);
                throw new ApiClientError({
                    status: response.status,
                    code,
                    messageKey: getErrorMessageKey(code, response.status),
                    rawMessage,
                });
            }

            if (response.status === 204) {
                return {} as T;
            }

            return response.json();
        } catch (error) {
            throw this.toApiClientError(error);
        }
    }

    get<T>(endpoint: string, options?: RequestOptions) {
        return this.request<T>(endpoint, { ...options, method: 'GET' });
    }

    post<T, B = unknown>(endpoint: string, body: B, options?: RequestOptions) {
        return this.request<T>(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });
    }

    put<T, B = unknown>(endpoint: string, body: B, options?: RequestOptions) {
        return this.request<T>(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) });
    }

    patch<T, B = unknown>(endpoint: string, body: B, options?: RequestOptions) {
        return this.request<T>(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) });
    }

    delete<T>(endpoint: string, options?: RequestOptions) {
        return this.request<T>(endpoint, { ...options, method: 'DELETE' });
    }

    toUiMessageKey(error: unknown): string {
        if (error instanceof ApiClientError) return error.messageKey;
        return 'errorKeys.unknown';
    }

    getRawErrorMessage(error: unknown): string | undefined {
        if (error instanceof ApiClientError) return error.rawMessage;
        if (error instanceof Error) return error.message;
        return undefined;
    }

    /**
     * Download a binary blob from the API.
     * Uses the same base URL and auth logic as other requests.
     */
    async getBlob(endpoint: string, options: RequestOptions = {}, attempt = 0): Promise<{ blob: Blob; headers: Headers }> {
        const { params, ...init } = options;
        const url = this.buildUrl(endpoint, params);
        const pathname = url.pathname;

        const headers = new Headers(init.headers);
        const token = localStorage.getItem('access_token');
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        try {
            const response = await fetch(url.toString(), { ...init, method: 'GET', headers, credentials: 'include' });

            if (response.status === 401) {
                if (this.shouldAttemptSilentReauth(pathname, attempt)) {
                    const refreshedToken = await silentReauthAndExchange();
                    if (refreshedToken) {
                        return this.getBlob(endpoint, options, attempt + 1);
                    }
                }

                localStorage.removeItem('access_token');
                window.location.href = '/login';
                throw new ApiClientError({
                    status: 401,
                    code: 'UNAUTHORIZED',
                    messageKey: getErrorMessageKey('UNAUTHORIZED', 401),
                    rawMessage: 'Unauthorized',
                });
            }

            if (!response.ok) {
                throw new ApiClientError({
                    status: response.status,
                    code: 'REQUEST_FAILED',
                    messageKey: getErrorMessageKey('REQUEST_FAILED', response.status),
                    rawMessage: `Download failed: ${response.statusText}`,
                });
            }

            return { blob: await response.blob(), headers: response.headers };
        } catch (error) {
            throw this.toApiClientError(error);
        }
    }
}

export const apiClient = new ApiClient(API_URL);
