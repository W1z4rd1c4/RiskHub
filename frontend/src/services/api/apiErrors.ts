import { getErrorMessageKey } from '@/i18n/getErrorMessageKey';

import type { ApiClientErrorPayload } from './apiTypes';

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

export function parseErrorMessage(errorData: unknown, status: number): string {
    if (!errorData || typeof errorData !== 'object') {
        return `Request failed with status ${status}`;
    }

    const detail = (errorData as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        return detail
            .map((entry) => {
                if (typeof entry === 'string') return entry;
                if (entry && typeof entry === 'object') {
                    const row = entry as { msg?: string; message?: string };
                    return row.msg || row.message || JSON.stringify(entry);
                }
                return String(entry);
            })
            .join('; ');
    }
    if (detail) return JSON.stringify(detail);

    return `Request failed with status ${status}`;
}

export function toApiClientError(error: unknown): ApiClientError {
    if (error instanceof ApiClientError) {
        return error;
    }

    return new ApiClientError({
        code: 'NETWORK_ERROR',
        messageKey: getErrorMessageKey('NETWORK_ERROR'),
        rawMessage: error instanceof Error ? error.message : String(error),
    });
}
