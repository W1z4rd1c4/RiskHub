import { describe, expect, it } from 'vitest';

import { humanizeCode, translateCode } from '@/lib/humanizeCode';

describe('humanizeCode', () => {
    it.each([
        ['risk_update', 'Risk update'],
        ['risk-update', 'Risk update'],
        ['status__change', 'Status change'],
        ['  login ', 'Login'],
        ['already Words', 'Already Words'],
        ['éclair_ready', 'Éclair ready'],
    ])('turns %s into %s', (code, expected) => {
        expect(humanizeCode(code)).toBe(expected);
    });

    it.each([[null], [undefined], [''], ['   '], ['___']])('returns an empty string for %s', (code) => {
        expect(humanizeCode(code)).toBe('');
    });
});

describe('translateCode', () => {
    const t = (key: string, options?: Record<string, unknown>) =>
        key === 'health.job_status.running' ? 'Běží' : String(options?.defaultValue ?? key);

    it('uses the translation when the locale has one', () => {
        expect(translateCode(t, 'health.job_status', 'running')).toBe('Běží');
    });

    it('falls back to the humanized code instead of leaking snake_case', () => {
        expect(translateCode(t, 'health.job_status', 'dead_letter')).toBe('Dead letter');
    });

    it('returns an empty string for a missing code', () => {
        expect(translateCode(t, 'health.job_status', null)).toBe('');
        expect(translateCode(t, 'health.job_status', undefined)).toBe('');
    });
});
