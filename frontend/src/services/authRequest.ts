import {
    REQUEST_TIMEOUT_MS,
    RequestRuntimeError,
    fetchWithTimeout,
    isAbortError,
} from '@/services/api/requestRuntime';

export const AUTH_REQUEST_TIMEOUT_MS = REQUEST_TIMEOUT_MS;

export type AuthRequestErrorCode =
    | 'AUTH_REQUEST_TIMEOUT'
    | 'AUTH_SERVICE_UNAVAILABLE'
    | 'AUTH_REQUEST_FAILED'
    | 'AUTH_CONFIG_LOAD_FAILED';

interface AuthRequestErrorOptions {
    code: AuthRequestErrorCode;
    message: string;
    rawMessage?: string;
    status?: number;
}

export class AuthRequestError extends Error {
    code: AuthRequestErrorCode;
    rawMessage?: string;
    status?: number;

    constructor(options: AuthRequestErrorOptions) {
        super(options.message);
        this.name = 'AuthRequestError';
        this.code = options.code;
        this.rawMessage = options.rawMessage;
        this.status = options.status;
    }
}

export function isAuthUnavailableError(error: unknown): boolean {
    return error instanceof AuthRequestError && (
        error.code === 'AUTH_REQUEST_TIMEOUT' ||
        error.code === 'AUTH_SERVICE_UNAVAILABLE' ||
        (typeof error.status === 'number' && error.status >= 500)
    );
}

export async function fetchAuthResponse(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    try {
        return await fetchWithTimeout(input, init);
    } catch (error) {
        if (error instanceof RequestRuntimeError && error.code === 'REQUEST_TIMEOUT') {
            throw new AuthRequestError({
                code: 'AUTH_REQUEST_TIMEOUT',
                message: 'Auth request timed out',
                rawMessage: 'Auth request timed out',
            });
        }
        if (isAbortError(error)) {
            throw error;
        }

        throw new AuthRequestError({
            code: 'AUTH_SERVICE_UNAVAILABLE',
            message: 'Auth service unavailable',
            rawMessage: error instanceof RequestRuntimeError
                ? error.rawMessage
                : error instanceof Error ? error.message : String(error),
        });
    }
}

export async function raceAuthTimeout<T>(
    promise: Promise<T>,
    message = 'Auth request timed out',
): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
        const timeoutId = globalThis.setTimeout(() => {
            reject(new AuthRequestError({
                code: 'AUTH_REQUEST_TIMEOUT',
                message,
                rawMessage: message,
            }));
        }, AUTH_REQUEST_TIMEOUT_MS);

        promise.then(resolve).catch((error) => {
            reject(error instanceof Error ? error : new Error(String(error)));
        }).finally(() => {
            globalThis.clearTimeout(timeoutId);
        });
    });
}
