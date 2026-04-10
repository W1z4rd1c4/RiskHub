import type { ZodTypeAny } from 'zod';

export type QueryScalar = string | number | boolean;
export type QueryValue = QueryScalar | QueryScalar[] | null | undefined;
export type QueryParams = URLSearchParams | Record<string, QueryValue>;

export interface RequestOptions extends RequestInit {
    params?: QueryParams;
    timeoutMs?: number | null;
}

export interface SchemaRequestOptions<S extends ZodTypeAny> extends RequestOptions {
    schema: S;
}

export interface PreparedRequest {
    url: URL;
    pathname: string;
    init: RequestInit;
    timeoutMs?: number | null;
}

export interface ApiClientErrorPayload {
    status?: number;
    code?: string;
    messageKey: string;
    rawMessage?: string;
}

export interface RequestExecutorOptions<T> {
    endpoint: string;
    options?: RequestOptions;
    attempt?: number;
    parseSuccess: (response: Response) => Promise<T>;
    parseError?: (response: Response) => Promise<ApiClientErrorPayload>;
}
