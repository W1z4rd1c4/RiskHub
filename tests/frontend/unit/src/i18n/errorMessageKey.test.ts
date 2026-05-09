import { describe, expect, it } from 'vitest';

import { ERROR_CODE_TO_KEY, getErrorMessageKey } from '@/i18n/errorMessageKey';

describe('getErrorMessageKey', () => {
    it('maps known codes via the table', () => {
        expect(getErrorMessageKey('UNAUTHORIZED')).toBe('errorKeys.unauthorized');
        expect(getErrorMessageKey('validation_error')).toBe('errorKeys.validation');
    });

    it('falls back to status-based mapping when no code matches', () => {
        expect(getErrorMessageKey(undefined, 401)).toBe('errorKeys.unauthorized');
        expect(getErrorMessageKey('UNKNOWN_X', 500)).toBe('errorKeys.server');
    });

    it('returns errorKeys.unknown when nothing matches', () => {
        expect(getErrorMessageKey()).toBe('errorKeys.unknown');
    });
});

describe('ERROR_CODE_TO_KEY', () => {
    it('has 10 entries covering all UiErrorCode variants', () => {
        expect(Object.keys(ERROR_CODE_TO_KEY)).toHaveLength(10);
    });
});
