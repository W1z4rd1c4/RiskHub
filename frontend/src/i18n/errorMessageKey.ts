import type { ErrorMessageKey, UiErrorCode } from '@/types/i18n';

export const ERROR_CODE_TO_KEY: Record<UiErrorCode, ErrorMessageKey> = {
    UNAUTHORIZED: 'errorKeys.unauthorized',
    FORBIDDEN: 'errorKeys.forbidden',
    NOT_FOUND: 'errorKeys.not_found',
    VALIDATION_ERROR: 'errorKeys.validation',
    NETWORK_ERROR: 'errorKeys.network',
    REQUEST_TIMEOUT: 'errorKeys.request_timeout',
    SERVER_ERROR: 'errorKeys.server',
    REQUEST_FAILED: 'errorKeys.request_failed',
    DEMO_LOGIN_FAILED: 'errorKeys.demo_login_failed',
    UNKNOWN_ERROR: 'errorKeys.unknown',
};

export function getErrorMessageKey(code?: string | null, status?: number): ErrorMessageKey {
    if (code) {
        const normalized = code.toUpperCase() as UiErrorCode;
        if (normalized in ERROR_CODE_TO_KEY) {
            return ERROR_CODE_TO_KEY[normalized];
        }
    }

    if (status === 401) return 'errorKeys.unauthorized';
    if (status === 403) return 'errorKeys.forbidden';
    if (status === 404) return 'errorKeys.not_found';
    if (status === 422) return 'errorKeys.validation';
    if (status && status >= 500) return 'errorKeys.server';

    return 'errorKeys.unknown';
}
