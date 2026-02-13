export const I18N_ERROR_NAMESPACE = 'errorKeys' as const;

export type UiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'REQUEST_FAILED'
  | 'DEMO_LOGIN_FAILED'
  | 'UNKNOWN_ERROR';

export type ErrorMessageKey = `errorKeys.${string}`;
