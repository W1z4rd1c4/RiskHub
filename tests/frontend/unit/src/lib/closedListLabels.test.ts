/**
 * GAP-C-09 / PM-4: the ICT Register workbook closed-list codes are stored and
 * sent verbatim; only their display labels are translated (en + cs), with the
 * raw code as the fallback for language-neutral or unknown codes.
 */
import { afterEach, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import csCommon from '@/i18n/locales/cs/common.json';
import enCommon from '@/i18n/locales/en/common.json';
import { closedListLabel, closedListOptions, TRANSLATED_CLOSED_LISTS } from '@/lib/closedListLabels';

type Bundle = { values: { closed_lists: Record<string, Record<string, string>> } };

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('closed-list display labels', () => {
    it('has an en and cs label for every translated code (cs = the workbook wording)', () => {
        for (const [list, slugs] of Object.entries(TRANSLATED_CLOSED_LISTS)) {
            for (const [code, slug] of Object.entries(slugs)) {
                const en = (enCommon as Bundle).values.closed_lists[list]?.[slug];
                const cs = (csCommon as Bundle).values.closed_lists[list]?.[slug];
                expect(en, `${list}.${slug} (en)`).toBeTruthy();
                expect(cs, `${list}.${slug} (cs)`).toBe(code);
            }
        }
    });

    it('translates codes for English users and keeps the Czech wording in Czech', async () => {
        const t = i18n.t.bind(i18n);
        expect(closedListLabel(t, 'AnoNe', 'Ano')).toBe('Yes');
        expect(closedListLabel(t, 'TypUjednani', 'Rámcové (master)')).toBe('Master (overarching) arrangement');
        expect(closedListLabel(t, 'RoleDodavatele', 'Zálohuje / obnova')).toBe('Backup / recovery');

        await i18n.changeLanguage('cs');
        expect(closedListLabel(i18n.t.bind(i18n), 'AnoNe', 'Ne')).toBe('Ne');
    });

    it('falls back to the raw value for language-neutral or unknown codes', () => {
        const t = i18n.t.bind(i18n);
        expect(closedListLabel(t, 'MenaList', 'CZK')).toBe('CZK');
        expect(closedListLabel(t, 'SystemEvidence', 'SAP')).toBe('SAP');
        expect(closedListLabel(t, 'AnoNe', 'Možná')).toBe('Možná');
        expect(closedListLabel(t, 'Skala15', 3)).toBe('3');
    });

    it('builds options whose values stay the stored workbook codes', () => {
        const options = closedListOptions(i18n.t.bind(i18n), { AnoNe: ['Ano', 'Ne'], MenaList: ['EUR'] }, 'AnoNe');
        expect(options).toEqual([
            { value: 'Ano', label: 'Yes' },
            { value: 'Ne', label: 'No' },
        ]);
        expect(closedListOptions(i18n.t.bind(i18n), {}, 'AnoNe')).toEqual([]);
    });
});
