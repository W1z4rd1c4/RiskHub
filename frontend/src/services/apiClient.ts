import { getErrorMessageKey } from '@/i18n/getErrorMessageKey';
import { isExplicitLogoutSuppressed } from '@/services/logoutSuppression';
import { clearAuthenticatedSession } from '@/services/sessionManager';
import { getSessionSnapshot } from '@/services/sessionStore';
import { silentReauthAndExchange } from '@/services/ssoSession';

// Use relative URL for nginx proxy (enables LAN access)
// In development, VITE_API_URL can override for direct backend connection
const API_URL =
    typeof import.meta.env.VITE_API_URL === 'string' && import.meta.env.VITE_API_URL.length > 0
        ? import.meta.env.VITE_API_URL
        : '/api/v1';

type QueryScalar = string | number | boolean;
type QueryValue = QueryScalar | QueryScalar[] | null | undefined;
type QueryParams = URLSearchParams | Record<string, QueryValue>;

interface RequestOptions extends RequestInit {
    params?: QueryParams;
}

interface PreparedRequest {
    url: URL;
    pathname: string;
    init: RequestInit;
}

interface RequestExecutorOptions<T> {
    endpoint: string;
    options?: RequestOptions;
    attempt?: number;
    parseSuccess: (response: Response) => Promise<T>;
    parseError?: (response: Response) => Promise<ApiClientErrorPayload>;
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

async function parseJsonBody<T>(response: Response): Promise<T> {
    const payload: unknown = await response.json();
    return payload as T;
}

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private shouldAttemptSilentReauth(pathname: string, attempt: number): boolean {
        if (isExplicitLogoutSuppressed()) return false;
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

            Object.entries(params).forEach(([key, value]) => {
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

    private buildPreparedRequest(endpoint: string, options: RequestOptions = {}): PreparedRequest {
        const { params, ...init } = options;
        const url = this.buildUrl(endpoint, params);
        const headers = new Headers(init.headers);
        const token = getSessionSnapshot().token;
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        if (!headers.has('Content-Type') && (init.method === 'POST' || init.method === 'PUT' || init.method === 'PATCH')) {
            headers.set('Content-Type', 'application/json');
        }

        return {
            url,
            pathname: url.pathname,
            init: { ...init, headers, credentials: 'include' },
        };
    }

    private async parseJsonError(response: Response): Promise<ApiClientErrorPayload> {
        const errorData: unknown = await parseJsonBody<unknown>(response).catch(
            () => ({} as Record<string, never>),
        );
        const code = typeof (errorData as { code?: unknown }).code === 'string'
            ? String((errorData as { code: string }).code)
            : typeof (errorData as { error_code?: unknown }).error_code === 'string'
                ? String((errorData as { error_code: string }).error_code)
                : undefined;
        const rawMessage = this.parseErrorMessage(errorData, response.status);
        return {
            status: response.status,
            code,
            messageKey: getErrorMessageKey(code, response.status),
            rawMessage,
        };
    }

    private async parseBlobError(response: Response): Promise<ApiClientErrorPayload> {
        const errorPayload = await this.parseJsonError(response);
        if (errorPayload.rawMessage) {
            return errorPayload;
        }
        return {
            status: response.status,
            code: 'REQUEST_FAILED',
            messageKey: getErrorMessageKey('REQUEST_FAILED', response.status),
            rawMessage: `Download failed: ${response.statusText || response.status}`,
        };
    }

    private async executeRequest<T>({
        endpoint,
        options = {},
        attempt = 0,
        parseSuccess,
        parseError = (response) => this.parseJsonError(response),
    }: RequestExecutorOptions<T>): Promise<T> {
        const prepared = this.buildPreparedRequest(endpoint, options);

        try {
            const response = await fetch(prepared.url.toString(), prepared.init);

            if (response.status === 401) {
                if (this.shouldAttemptSilentReauth(prepared.pathname, attempt)) {
                    const refreshedToken = await silentReauthAndExchange();
                    if (refreshedToken) {
                        return this.executeRequest({
                            endpoint,
                            options,
                            attempt: attempt + 1,
                            parseSuccess,
                            parseError,
                        });
                    }
                }

                clearAuthenticatedSession({ clearBootstrap: true });
                throw new ApiClientError({
                    status: 401,
                    code: 'UNAUTHORIZED',
                    messageKey: getErrorMessageKey('UNAUTHORIZED', 401),
                    rawMessage: 'Unauthorized',
                });
            }

            if (!response.ok) {
                throw new ApiClientError(await parseError(response));
            }

            return parseSuccess(response);
        } catch (error) {
            throw this.toApiClientError(error);
        }
    }

    private async request<T>(endpoint: string, options: RequestOptions = {}, attempt = 0): Promise<T> {
        return this.executeRequest({
            endpoint,
            options,
            attempt,
            parseSuccess: async (response) => {
                if (response.status === 204) {
                    return {} as T;
                }
                return parseJsonBody<T>(response);
            },
        });
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
        return this.executeRequest({
            endpoint,
            options: { ...options, method: 'GET' },
            attempt,
            parseSuccess: async (response) => ({ blob: await response.blob(), headers: response.headers }),
            parseError: (response) => this.parseBlobError(response),
        });
    }
}

export const apiClient = new ApiClient(API_URL);
