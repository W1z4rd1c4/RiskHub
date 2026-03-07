export const AUTH_REQUEST_TIMEOUT_MS = 8_000;

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

function combineSignals(signalA: AbortSignal, signalB?: AbortSignal): AbortSignal {
    if (!signalB) return signalA;

    const controller = new AbortController();
    const abort = () => controller.abort();

    if (signalA.aborted || signalB.aborted) {
        abort();
        return controller.signal;
    }

    signalA.addEventListener('abort', abort, { once: true });
    signalB.addEventListener('abort', abort, { once: true });
    return controller.signal;
}

export function isAuthUnavailableError(error: unknown): boolean {
    return error instanceof AuthRequestError && (
        error.code === 'AUTH_REQUEST_TIMEOUT' ||
        error.code === 'AUTH_SERVICE_UNAVAILABLE' ||
        (typeof error.status === 'number' && error.status >= 500)
    );
}

export async function fetchAuthResponse(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);

    try {
        return await fetch(input, {
            ...init,
            signal: combineSignals(controller.signal, init.signal ?? undefined),
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new AuthRequestError({
                code: 'AUTH_REQUEST_TIMEOUT',
                message: 'Auth request timed out',
                rawMessage: 'Auth request timed out',
            });
        }

        throw new AuthRequestError({
            code: 'AUTH_SERVICE_UNAVAILABLE',
            message: 'Auth service unavailable',
            rawMessage: error instanceof Error ? error.message : String(error),
        });
    } finally {
        globalThis.clearTimeout(timeoutId);
    }
}

export async function withAuthTimeout<T>(
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
            reject(error);
        }).finally(() => {
            globalThis.clearTimeout(timeoutId);
        });
    });
}
