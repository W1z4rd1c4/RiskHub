import { ERROR_CODE_TO_KEY } from '@/i18n/errorCodeMap';
import type { ErrorMessageKey, UiErrorCode } from '@/types/i18n';

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
