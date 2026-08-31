import { getErrorMessageKey } from '@/i18n/errorMessageKey';
import {
    getSessionOwnershipSnapshot,
    type SessionOwnershipSnapshot,
} from '@/services/session/coordinator';
import type { infer as ZodInfer, ZodTypeAny } from 'zod';

import { ApiClientError, toApiClientError } from './apiErrors';
import { buildPreparedRequest } from './apiRequestBuilder';
import { fetchWithTimeout, isAbortError } from './requestRuntime';
import { parseBodyWithSchema, parseErrorResponse, readResponseBody } from './responseParsing';
import {
    applySessionRefreshPolicy,
    assertRequestSessionOwnershipCurrent,
} from './sessionRefreshPolicy';
import type {
    ApiClientErrorPayload,
    RequestExecutorOptions,
    RequestOptions,
    SchemaRequestOptions,
} from './apiTypes';

export class ApiClient {
    private readonly baseUrl: string;

    constructor(baseUrl: string) { this.baseUrl = baseUrl; }
    private async parseJsonError(response: Response): Promise<ApiClientErrorPayload> { return parseErrorResponse(response); }

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

    private async executeRequest<T>(
        {
            endpoint,
            options = {},
            attempt = 0,
            parseSuccess,
            parseError = (response) => this.parseJsonError(response),
        }: RequestExecutorOptions<T>,
        requestOwner: SessionOwnershipSnapshot = getSessionOwnershipSnapshot(),
    ): Promise<T> {
        const prepared = buildPreparedRequest(this.baseUrl, endpoint, options);
        const assertAuthenticatedOwnerCurrent = () => {
            if (requestOwner.principalId !== null) {
                assertRequestSessionOwnershipCurrent(requestOwner);
            }
        };

        try {
            const response = await fetchWithTimeout(prepared.url.toString(), prepared.init, prepared.timeoutMs);
            assertAuthenticatedOwnerCurrent();

            if (response.status === 401) {
                assertRequestSessionOwnershipCurrent(requestOwner);
                if (prepared.init.signal?.aborted) {
                    throw new DOMException('The operation was aborted.', 'AbortError');
                }
                const refreshOutcome = await applySessionRefreshPolicy({
                    pathname: prepared.pathname,
                    attempt,
                    signal: prepared.init.signal ?? undefined,
                    owner: requestOwner,
                });
                if (prepared.init.signal?.aborted) {
                    throw new DOMException('The operation was aborted.', 'AbortError');
                }
                if (refreshOutcome.kind === 'retry') {
                    return this.executeRequest(
                        { endpoint, options, attempt: attempt + 1, parseSuccess, parseError },
                        requestOwner,
                    );
                }
            }

            if (!response.ok) {
                const error = await parseError(response);
                assertAuthenticatedOwnerCurrent();
                throw new ApiClientError(error);
            }

            const result = await parseSuccess(response);
            assertAuthenticatedOwnerCurrent();
            return result;
        } catch (error) {
            if (isAbortError(error)) {
                throw error;
            }
            throw toApiClientError(error);
        }
    }

    private async request<S extends ZodTypeAny>(
        endpoint: string,
        options: SchemaRequestOptions<S>,
        attempt = 0,
    ): Promise<ZodInfer<S>> {
        return this.executeRequest({
            endpoint,
            options,
            attempt,
            parseSuccess: async (response) => {
                const body = await readResponseBody(response);
                return parseBodyWithSchema(body, options.schema, response.status);
            },
        });
    }

    get<S extends ZodTypeAny>(endpoint: string, options: SchemaRequestOptions<S>) {
        return this.request(endpoint, { ...options, method: 'GET' });
    }

    post<S extends ZodTypeAny, B = unknown>(
        endpoint: string,
        body: B,
        options: Omit<SchemaRequestOptions<S>, 'body' | 'method'>,
    ) {
        return this.request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });
    }

    put<S extends ZodTypeAny, B = unknown>(
        endpoint: string,
        body: B,
        options: Omit<SchemaRequestOptions<S>, 'body' | 'method'>,
    ) {
        return this.request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) });
    }

    patch<S extends ZodTypeAny, B = unknown>(
        endpoint: string,
        body: B,
        options: Omit<SchemaRequestOptions<S>, 'body' | 'method'>,
    ) {
        return this.request(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) });
    }

    delete<S extends ZodTypeAny>(endpoint: string, options: SchemaRequestOptions<S>) {
        return this.request(endpoint, { ...options, method: 'DELETE' });
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
