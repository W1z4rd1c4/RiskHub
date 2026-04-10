export const REQUEST_TIMEOUT_MS = 8_000;

type RequestRuntimeErrorCode = 'REQUEST_TIMEOUT' | 'NETWORK_ERROR';

export class RequestRuntimeError extends Error {
    code: RequestRuntimeErrorCode;
    rawMessage?: string;

    constructor(code: RequestRuntimeErrorCode, message: string, rawMessage?: string) {
        super(message);
        this.name = 'RequestRuntimeError';
        this.code = code;
        this.rawMessage = rawMessage;
    }
}

export function isAbortError(error: unknown): error is { name: string } {
    if (error instanceof DOMException) {
        return error.name === 'AbortError';
    }
    return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
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

export async function fetchWithTimeout(
    input: RequestInfo | URL,
    init: RequestInit = {},
    timeoutMs: number | null | undefined = REQUEST_TIMEOUT_MS,
): Promise<Response> {
    const effectiveTimeoutMs = timeoutMs === undefined ? REQUEST_TIMEOUT_MS : timeoutMs;
    const controller = effectiveTimeoutMs === null ? null : new AbortController();
    let didTimeout = false;
    const timeoutId = controller
        ? globalThis.setTimeout(() => {
            didTimeout = true;
            controller.abort();
        }, effectiveTimeoutMs)
        : null;

    try {
        return await fetch(input, {
            ...init,
            signal: controller ? combineSignals(controller.signal, init.signal ?? undefined) : init.signal,
        });
    } catch (error) {
        if (isAbortError(error)) {
            if (!didTimeout) {
                throw error;
            }
            throw new RequestRuntimeError('REQUEST_TIMEOUT', 'Request timed out', 'Request timed out');
        }

        throw new RequestRuntimeError(
            'NETWORK_ERROR',
            'Network error',
            error instanceof Error ? error.message : String(error),
        );
    } finally {
        if (timeoutId !== null) {
            globalThis.clearTimeout(timeoutId);
        }
    }
}
