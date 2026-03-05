import { ApiClientError } from '@/services/apiClient';

export function formatFrequencyLabel(value: string): string {
    return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getControlFormErrorKey(error: unknown, fallback = 'errorKeys.unknown'): string {
    if (error instanceof ApiClientError) {
        return error.messageKey;
    }
    return fallback;
}
