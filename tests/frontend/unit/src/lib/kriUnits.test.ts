import { afterAll, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import type { SafeTFunction } from '@/i18n/hooks';
import { formatKriUnit, formatKriUnitName } from '@/lib/kriUnits';

const t = ((key: string, options?: Record<string, unknown>) => i18n.t(key, options)) as SafeTFunction;

/** Audit GAP-D-03: KRI unit codes are translated for display; the stored code is unchanged. */
describe('kriUnits', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('passes language-neutral and unknown units through', () => {
        expect(formatKriUnit('%', t, 40)).toBe('%');
        expect(formatKriUnit('CZK', t, 5)).toBe('CZK');
        expect(formatKriUnit('incidents', t, 5)).toBe('incidents');
        expect(formatKriUnit(null, t)).toBe('');
        expect(formatKriUnitName('', t)).toBe('');
    });

    it('translates unit names and suffixes in English', async () => {
        await i18n.changeLanguage('en');
        expect(formatKriUnitName('days', t)).toBe('Days');
        expect(formatKriUnit('days', t, 1)).toBe('day');
        expect(formatKriUnit('days', t, 3)).toBe('days');
        expect(formatKriUnit('count', t, 3)).toBe('count');
    });

    it('agrees with the value in Czech (one / few / other)', async () => {
        await i18n.changeLanguage('cs');
        expect(formatKriUnitName('days', t)).toBe('Dny');
        expect(formatKriUnit('days', t, 1)).toBe('den');
        expect(formatKriUnit('days', t, 3)).toBe('dny');
        expect(formatKriUnit('days', t, 7)).toBe('dní');
        expect(formatKriUnit('hours', t, 2)).toBe('hodiny');
        expect(formatKriUnit('ratio', t, 2)).toBe('poměr');
    });

    it('keeps decimal values in Czech instead of falling back to English (cs `_many`)', async () => {
        await i18n.changeLanguage('cs');
        expect(formatKriUnit('days', t, 1.5)).toBe('dne');
        expect(formatKriUnit('hours', t, 0.25)).toBe('hodiny');
        await i18n.changeLanguage('en');
        expect(formatKriUnit('days', t, 1.5)).toBe('days');
    });
});
