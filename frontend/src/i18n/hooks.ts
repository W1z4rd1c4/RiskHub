import { useCallback, useMemo } from 'react';
import { useTranslation as useI18nextTranslation } from 'react-i18next';
import type { Namespace } from './types';
import { useLanguageContext } from '@/contexts/LanguageContext';
import { normalizeSupportedLanguage, type SupportedLanguage } from '@/i18n';
import {
    formatCurrencyValue,
    formatDateTimeValue,
    formatDateValue,
    formatMetricNumberValue,
    formatNumberValue,
    formatPercentValue,
    formatRelativeDateValue,
    formatTimeValue,
} from './formatters';

/**
 * Type-safe translation hook with namespace support.
 * Wraps react-i18next's useTranslation with proper typing.
 */
export function useTypedTranslation<NS extends Namespace = 'common'>(ns?: NS) {
    return useI18nextTranslation(ns);
}

export type TranslationOptions = Record<string, unknown> & {
    defaultValue?: string;
    ns?: string | string[];
};

export type SafeTFunction = {
    (key: string, options?: TranslationOptions): string;
    (key: string): string;
    (key: string, options: TranslationOptions): string;
    (key: string, defaultValue: string): string;
    (key: string, defaultValue: string, options: TranslationOptions): string;
};

/**
 * Repo-wide translation hook.
 *
 * Why this exists:
 * - The codebase uses multiple `t()` call shapes, including `t(key, fallbackString)`
 *   and `t(key, fallbackString, options)`.
 * - react-i18next's `t` overloads + TS can sometimes hit internal compiler errors
 *   (we observed this in `npm run build`).
 *
 * This wrapper normalizes those call shapes to the object-form `defaultValue`,
 * while keeping behavior identical.
 */
export function useTranslation<NS extends Namespace = 'common'>(
    ns?: NS | readonly NS[],
    options?: unknown,
) {
    type I18nextNs = Parameters<typeof useI18nextTranslation>[0];
    type I18nextOptions = Parameters<typeof useI18nextTranslation>[1];
    const result = useI18nextTranslation(
        ns as unknown as I18nextNs,
        options as I18nextOptions,
    );
    const rawT = result.t as unknown as (key: string, options?: TranslationOptions) => string;

    // Ensure `t` identity is stable across renders when i18next's `t` is stable.
    // Many components include `t` in hook dependency arrays; an unstable `t` reference
    // can cause effect loops and repeated refetching.
    const t = useCallback(
        (key: string, arg2?: string | TranslationOptions, arg3?: TranslationOptions) => {
            const useErrorNamespace = key.startsWith('errorKeys.');
            const normalizedKey = useErrorNamespace
                ? key.slice('errorKeys.'.length)
                : key;
            const normalizeOptions = (
                value?: TranslationOptions,
            ): TranslationOptions | undefined => {
                if (!useErrorNamespace) return value;
                return { ...(value ?? {}), ns: 'errorKeys' };
            };

            if (typeof arg2 === 'string') {
                return rawT(normalizedKey, normalizeOptions({ defaultValue: arg2, ...(arg3 ?? {}) }));
            }
            return rawT(normalizedKey, normalizeOptions(arg2));
        },
        [rawT]
    ) as SafeTFunction;

    return { ...result, t };
}

const ERROR_KEYS_PREFIX = 'errorKeys.';
/** `ns:key.path` (for example `kris:errors.load_failed`). */
const NAMESPACED_KEY_PATTERN = /^[A-Za-z][\w-]*:[\w-]+(?:\.[\w-]+)*$/;
/** `segment.segment` key in the caller's default namespace (no whitespace). */
const DOTTED_KEY_PATTERN = /^[a-z][\w-]*(?:\.[\w-]+)+$/;

/** Any `t` shape: the repo wrapper (`SafeTFunction`) or a raw i18next `t`. */
export type UiMessageTranslator = (key: string, options?: TranslationOptions) => string;

/**
 * The one way to render a UI message (audit 2026-09-30 §4.18, PG-36).
 *
 * `keyOrMessage` may be:
 * - an `errorKeys.*` key from `apiClient.toUiMessageKey()` → translated in the
 *   `errorKeys` namespace, falling back to `errorKeys.unknown` when missing;
 * - a namespaced key (`kris:errors.save_failed`) or a dotted key in the
 *   caller's namespace (`errors.load_failed`) → translated through `t`;
 * - already human-readable text → returned unchanged.
 *
 * Null or empty input returns `''`, so callers can render it conditionally.
 */
export function translateUiMessage(
    t: UiMessageTranslator,
    keyOrMessage: string | null | undefined,
    options?: TranslationOptions,
): string {
    if (!keyOrMessage) return '';
    if (keyOrMessage.startsWith(ERROR_KEYS_PREFIX)) {
        return t(keyOrMessage.slice(ERROR_KEYS_PREFIX.length), {
            ...(options ?? {}),
            ns: 'errorKeys',
            defaultValue: t('unknown', { ns: 'errorKeys' }),
        });
    }
    if (NAMESPACED_KEY_PATTERN.test(keyOrMessage) || DOTTED_KEY_PATTERN.test(keyOrMessage)) {
        return t(keyOrMessage, options);
    }
    return keyOrMessage;
}

type DateInput = Date | string | null | undefined;
type NumberInput = number | null | undefined;

export interface FormatApi {
    /** Active UI language (`en` / `cs`), the same value `useLanguage()` reports. */
    locale: SupportedLanguage;
    /** Date; default style `{ year: 'numeric', month: 'short', day: 'numeric' }`. */
    date: (value: DateInput, options?: Intl.DateTimeFormatOptions) => string;
    /** Date + hours:minutes, same month style as `date`. */
    dateTime: (value: DateInput, options?: Intl.DateTimeFormatOptions) => string;
    time: (value: DateInput, options?: Intl.DateTimeFormatOptions) => string;
    /** "3 days ago" / "před 3 dny", relative to now. */
    relative: (value: DateInput) => string;
    number: (value: NumberInput, options?: Intl.NumberFormatOptions) => string;
    /** Magnitude-aware precision; `unit` is an Intl unit id (`day`, `percent`, …). */
    metric: (value: NumberInput, unit?: string) => string;
    /** `value` is a ratio: `0.42` → "42%" / "42 %". */
    percent: (value: NumberInput, fractionDigits?: number) => string;
    currency: (value: NumberInput, currency?: string) => string;
    /** Plural-aware phrase: `t(key, { count })`; `key` must be a plural family. */
    count: (count: number, key: string, options?: TranslationOptions) => string;
}

/**
 * Locale-aware formatting for every surface (audit 2026-09-30 §4.17, I18N-03).
 *
 * The locale is the active UI language (normalised exactly like
 * `LanguageProvider`), never a hard-coded `cs-CZ`. Empty, null or invalid
 * values format to `''` so callers choose their own fallback
 * (`format.date(value) || t('fallbacks.not_set')`).
 */
export function useFormat(): FormatApi {
    const { t, i18n: i18nInstance } = useTranslation('common');
    const locale = normalizeSupportedLanguage(i18nInstance.language);

    return useMemo<FormatApi>(() => ({
        locale,
        date: (value, options) => formatDateValue(value, locale, options),
        dateTime: (value, options) => formatDateTimeValue(value, locale, options),
        time: (value, options) => formatTimeValue(value, locale, options),
        relative: (value) => formatRelativeDateValue(value, locale),
        number: (value, options) => formatNumberValue(value, locale, options),
        metric: (value, unit) => formatMetricNumberValue(value, locale, unit),
        percent: (value, fractionDigits) => formatPercentValue(value, locale, fractionDigits),
        currency: (value, currency) => formatCurrencyValue(value, locale, currency),
        count: (count, key, options) => t(key, { ...(options ?? {}), count }),
    }), [locale, t]);
}

/**
 * Hook for locale-aware date formatting.
 * Uses the current i18n language for Intl.DateTimeFormat.
 *
 * @deprecated Use `useFormat()` (`date`, `dateTime`, `relative`).
 */
export function useFormattedDate() {
    const { i18n: i18nInstance } = useI18nextTranslation();
    const locale = i18nInstance.language;

    const formatDate = useCallback(
        (date: Date | string | null | undefined, options?: Intl.DateTimeFormatOptions) => {
            return formatDateValue(date, locale, options);
        },
        [locale]
    );

    const formatDateTime = useCallback(
        (date: Date | string | null | undefined, options?: Intl.DateTimeFormatOptions) => {
            return formatDateTimeValue(date, locale, options);
        },
        [locale]
    );

    const formatRelativeDate = useCallback(
        (date: Date | string | null | undefined) => {
            return formatRelativeDateValue(date, locale);
        },
        [locale]
    );

    return useMemo(
        () => ({ formatDate, formatDateTime, formatRelativeDate }),
        [formatDate, formatDateTime, formatRelativeDate]
    );
}

/**
 * Hook for locale-aware number formatting.
 * Handles different decimal separators (e.g., "," in Czech vs "." in English).
 *
 * @deprecated Use `useFormat()` (`number`, `percent`, `currency`).
 */
export function useFormattedNumber() {
    const { i18n: i18nInstance } = useI18nextTranslation();
    const locale = i18nInstance.language;

    const formatNumber = useCallback(
        (value: number | null | undefined, options?: Intl.NumberFormatOptions) => {
            return formatNumberValue(value, locale, options);
        },
        [locale]
    );

    const formatCurrency = useCallback(
        (value: number | null | undefined, currency = 'CZK') => formatCurrencyValue(value, locale, currency),
        [locale]
    );

    const formatPercent = useCallback(
        (value: number | null | undefined, decimals = 0) => formatPercentValue(value, locale, decimals),
        [locale]
    );

    const formatCompact = useCallback(
        (value: number | null | undefined) => {
            if (value === null || value === undefined) return '';

            return new Intl.NumberFormat(locale, {
                notation: 'compact',
                compactDisplay: 'short',
            }).format(value);
        },
        [locale]
    );

    return useMemo(
        () => ({ formatNumber, formatCurrency, formatPercent, formatCompact }),
        [formatNumber, formatCurrency, formatPercent, formatCompact]
    );
}

/**
 * Hook to get and set the current language.
 * Updates i18n, localStorage, and syncs to server when authenticated.
 */
export function useLanguage() {
    return useLanguageContext();
}

// Re-export the raw react-i18next hook for cases that need full typing surface.
export { useI18nextTranslation as useI18nextTranslation };
