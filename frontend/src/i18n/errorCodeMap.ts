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
