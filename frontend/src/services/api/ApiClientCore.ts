import { getErrorMessageKey } from '@/i18n/getErrorMessageKey';
import { isExplicitLogoutSuppressed } from '@/services/logoutSuppression';
import { clearAuthenticatedSession } from '@/services/sessionManager';
import { silentReauthAndExchange } from '@/services/ssoSession';

import { ApiClientError, parseErrorMessage, toApiClientError } from './apiErrors';
import { buildPreparedRequest } from './apiRequestBuilder';
import type { ApiClientErrorPayload, RequestExecutorOptions, RequestOptions } from './apiTypes';

async function parseJsonBody<T>(response: Response): Promise<T> {
    const payload: unknown = await response.json();
    return payload as T;
}

export class ApiClient {
    private readonly baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private shouldAttemptSilentReauth(pathname: string, attempt: number): boolean {
        if (isExplicitLogoutSuppressed()) return false;
        if (attempt > 0) return false;
        if (pathname.startsWith('/api/v1/auth/')) return false;
        return true;
    }

    private async parseJsonError(response: Response): Promise<ApiClientErrorPayload> {
        const errorData: unknown = await parseJsonBody<unknown>(response).catch(
            () => ({} as Record<string, never>),
        );
        const code =
            typeof (errorData as { code?: unknown }).code === 'string'
                ? String((errorData as { code: string }).code)
                : typeof (errorData as { error_code?: unknown }).error_code === 'string'
                    ? String((errorData as { error_code: string }).error_code)
                    : undefined;
        const rawMessage = parseErrorMessage(errorData, response.status);
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
        const prepared = buildPreparedRequest(this.baseUrl, endpoint, options);

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
            throw toApiClientError(error);
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

    async getBlob(
        endpoint: string,
        options: RequestOptions = {},
        attempt = 0,
    ): Promise<{ blob: Blob; headers: Headers }> {
        return this.executeRequest({
            endpoint,
            options: { ...options, method: 'GET' },
            attempt,
            parseSuccess: async (response) => ({ blob: await response.blob(), headers: response.headers }),
            parseError: (response) => this.parseBlobError(response),
        });
    }
}
