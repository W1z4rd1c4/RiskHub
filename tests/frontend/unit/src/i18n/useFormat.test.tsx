import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { translateUiMessage, useFormat, useTranslation } from '@/i18n/hooks';

/**
 * Audit 2026-09-30 §4.17 / §4.18 (I18N-03, PG-18, PG-36): one locale-aware
 * formatting hook driven by the UI language, plural-aware counts and one
 * helper for `errorKeys.*` / namespaced keys / free text.
 */
const SAMPLE_DATE = '2026-09-30T12:00:00Z';
const NBSP = ' ';

async function switchLanguage(language: 'en' | 'cs') {
    await act(async () => { await i18n.changeLanguage(language); });
}

describe('useFormat()', () => {
    afterEach(async () => {
        await switchLanguage('en');
    });

    it('formats with the English UI language by default', () => {
        const { result } = renderHook(() => useFormat());
        const format = result.current;

        expect(format.locale).toBe('en');
        // Local noon: the calendar day is the same in every test-runner timezone.
        expect(format.date(new Date(2026, 8, 30, 12))).toBe('Sep 30, 2026');
        expect(format.dateTime(SAMPLE_DATE)).toBe(
            new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                .format(new Date(SAMPLE_DATE)),
        );
        expect(format.number(1234.5)).toBe('1,234.5');
        expect(format.percent(0.42)).toBe('42%');
        expect(format.percent(0.4256, 1)).toBe('42.6%');
        expect(format.currency(1500)).toBe(`CZK${NBSP}1,500`);
        expect(format.currency(1500, 'EUR')).toBe('€1,500');
        expect(format.metric(0.1234)).toBe('0.12');
        expect(format.metric(42.25)).toBe('42.3');
        expect(format.metric(3, 'day')).toBe('3 days');
    });

    it('returns an empty string for empty or invalid values so callers pick the fallback', () => {
        const { result } = renderHook(() => useFormat());

        expect(result.current.date(null)).toBe('');
        expect(result.current.dateTime('not-a-date')).toBe('');
        expect(result.current.relative(undefined)).toBe('');
        expect(result.current.number(null)).toBe('');
        expect(result.current.number(Number.NaN)).toBe('');
        expect(result.current.metric(Number.NaN, 'day')).toBe('');
        expect(result.current.percent(undefined)).toBe('');
        expect(result.current.currency(null)).toBe('');
        expect(result.current.date('2026-02-30')).toBe('');
    });

    it('formats a calendar date (YYYY-MM-DD) as that day in every timezone, not as UTC midnight', () => {
        const { result } = renderHook(() => useFormat());

        // `new Date('2026-09-30')` is UTC midnight, i.e. 29 Sep west of UTC.
        expect(result.current.date('2026-09-30')).toBe('Sep 30, 2026');
        expect(result.current.date(' 2026-01-01 ')).toBe('Jan 1, 2026');
        expect(result.current.dateTime('2026-09-30')).toBe(
            new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                .format(new Date(2026, 8, 30)),
        );
        // Instants keep their timezone semantics.
        expect(result.current.dateTime(SAMPLE_DATE)).toBe(
            new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                .format(new Date(SAMPLE_DATE)),
        );
    });

    it('follows a language switch without a hard-coded cs-CZ locale', async () => {
        const { result } = renderHook(() => useFormat());
        const english = result.current;

        await switchLanguage('cs');

        expect(result.current).not.toBe(english);
        expect(result.current.locale).toBe('cs');
        expect(result.current.date(SAMPLE_DATE)).toBe(
            new Intl.DateTimeFormat('cs', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(SAMPLE_DATE)),
        );
        expect(result.current.number(1234.5)).toBe(`1${NBSP}234,5`);
        expect(result.current.percent(0.42)).toBe(`42${NBSP}%`);
        expect(result.current.currency(1500)).toBe(`1${NBSP}500${NBSP}Kč`);
        expect(result.current.metric(3, 'day')).toBe('3 dny');
    });

    it('re-renders formatted output when the language changes', async () => {
        function Amount() {
            const format = useFormat();
            return <output>{format.number(1234.5)}</output>;
        }
        render(<Amount />);
        expect(screen.getByRole('status')).toHaveTextContent('1,234.5');

        await switchLanguage('cs');

        expect(screen.getByRole('status').textContent).toBe(`1${NBSP}234,5`);
    });

    it('formats relative dates in the UI language', async () => {
        const { result } = renderHook(() => useFormat());
        const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
        expect(result.current.relative(threeDaysAgo)).toBe('3 days ago');

        await switchLanguage('cs');
        expect(result.current.relative(threeDaysAgo)).toBe('před 3 dny');
    });

    it('picks the plural form per language (en _one/_other, cs _one/_few/_other)', async () => {
        const { result } = renderHook(() => useFormat());
        const key = 'common:confirm.archive.title_count';

        expect(result.current.count(1, key)).toBe('Archive 1 item?');
        expect(result.current.count(3, key)).toBe('Archive 3 items?');

        await switchLanguage('cs');
        expect(result.current.count(1, key)).toBe('Archivovat 1 položku?');
        expect(result.current.count(3, key)).toBe('Archivovat 3 položky?');
        expect(result.current.count(5, key)).toBe('Archivovat 5 položek?');
        expect(result.current.count(0, key)).toBe('Archivovat 0 položek?');
    });
});

describe('translateUiMessage()', () => {
    afterEach(async () => {
        await switchLanguage('en');
    });

    it('translates errorKeys, namespaced keys and caller-namespace keys and passes free text through', () => {
        const { result } = renderHook(() => useTranslation('risks'));
        const { t } = result.current;

        expect(translateUiMessage(t, 'errorKeys.network')).toBe('Network error. Please check your connection.');
        expect(translateUiMessage(t, 'common:errors.load_failed')).toBe('Failed to load data.');
        expect(translateUiMessage(t, 'messages.restore_success')).toBe('Risk restored successfully.');
        expect(translateUiMessage(t, 'The backend said no.')).toBe('The backend said no.');
        expect(translateUiMessage(t, null)).toBe('');
        expect(translateUiMessage(t, '')).toBe('');
    });

    it('falls back to errorKeys.unknown for an unknown error key', () => {
        const { result } = renderHook(() => useTranslation('common'));

        expect(translateUiMessage(result.current.t, 'errorKeys.no_such_key'))
            .toBe(translateUiMessage(result.current.t, 'errorKeys.unknown'));
        expect(translateUiMessage(result.current.t, 'errorKeys.no_such_key')).not.toContain('no_such_key');
    });

    it('works with the raw i18next t and in Czech', async () => {
        await switchLanguage('cs');
        const rawT = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

        expect(translateUiMessage(rawT, 'errorKeys.network')).toBe(i18n.t('network', { ns: 'errorKeys' }));
        expect(translateUiMessage(rawT, 'risks:messages.restore_failed')).toBe('Riziko se nepodařilo obnovit.');
    });
});
