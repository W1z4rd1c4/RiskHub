import { describe, expect, it } from 'vitest';
import { getErrorMessageKey } from '@/i18n/errorMessageKey';

describe('getErrorMessageKey', () => {
  it('maps known backend codes', () => {
    expect(getErrorMessageKey('UNAUTHORIZED')).toBe('errorKeys.unauthorized');
    expect(getErrorMessageKey('FORBIDDEN')).toBe('errorKeys.forbidden');
    expect(getErrorMessageKey('VALIDATION_ERROR')).toBe('errorKeys.validation');
    expect(getErrorMessageKey('REQUEST_TIMEOUT')).toBe('errorKeys.request_timeout');
    expect(getErrorMessageKey('DEMO_LOGIN_FAILED')).toBe('errorKeys.demo_login_failed');
  });

  it('falls back by HTTP status', () => {
    expect(getErrorMessageKey(undefined, 401)).toBe('errorKeys.unauthorized');
    expect(getErrorMessageKey(undefined, 403)).toBe('errorKeys.forbidden');
    expect(getErrorMessageKey(undefined, 404)).toBe('errorKeys.not_found');
    expect(getErrorMessageKey(undefined, 422)).toBe('errorKeys.validation');
    expect(getErrorMessageKey(undefined, 500)).toBe('errorKeys.server');
  });

  it('returns unknown for unmapped values', () => {
    expect(getErrorMessageKey('SOMETHING_ELSE')).toBe('errorKeys.unknown');
  });
});
