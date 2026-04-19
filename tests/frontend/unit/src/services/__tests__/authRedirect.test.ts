import { describe, expect, it } from 'vitest';

import { sanitizeReturnTo } from '@/services/authRedirect';

describe('sanitizeReturnTo', () => {
    it('allows normal in-app paths', () => {
        expect(sanitizeReturnTo('/risks/42')).toBe('/risks/42');
    });

    it('rejects backslash-normalized redirect payloads', () => {
        expect(sanitizeReturnTo('/\\evil.com')).toBe('/');
    });

    it('rejects protocol-relative paths after normalization', () => {
        expect(sanitizeReturnTo('//evil.com')).toBe('/');
    });
});
