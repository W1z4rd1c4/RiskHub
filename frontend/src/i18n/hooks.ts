import { useCallback, useMemo } from 'react';
import { useTranslation as useI18nextTranslation } from 'react-i18next';
import { type SupportedLanguage, STORAGE_KEY } from './index';
import type { Namespace } from './types';
import { useAuth } from '@/contexts/AuthContext';
import { saveLanguageToServer } from '@/utils/userSettingsStorage';
import {
    formatDateTimeValue,
    formatDateValue,
    formatNumberValue,
    formatRelativeDateValue,
} from './formatters';

/**
 * Type-safe translation hook with namespace support.
 * Wraps react-i18next's useTranslation with proper typing.
 */
export function useTypedTranslation<NS extends Namespace = 'common'>(ns?: NS) {
    return useI18nextTranslation(ns);
}

type TranslationOptions = Record<string, unknown> & {
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

/**
 * Hook for locale-aware date formatting.
 * Uses the current i18n language for Intl.DateTimeFormat.
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
        (value: number | null | undefined, currency = 'CZK') => {
            if (value === null || value === undefined) return '';

            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            }).format(value);
        },
        [locale]
    );

    const formatPercent = useCallback(
        (value: number | null | undefined, decimals = 0) => {
            if (value === null || value === undefined) return '';

            return new Intl.NumberFormat(locale, {
                style: 'percent',
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            }).format(value);
        },
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
    const { i18n: i18nInstance } = useI18nextTranslation();
    const { isAuthenticated } = useAuth();

    const language = i18nInstance.language as SupportedLanguage;

    const setLanguage = useCallback(
        (newLang: SupportedLanguage) => {
            i18nInstance.changeLanguage(newLang);
            if (isAuthenticated) {
                saveLanguageToServer(newLang).catch(console.error);
            } else {
                localStorage.setItem(STORAGE_KEY, newLang);
            }
        },
        [i18nInstance, isAuthenticated]
    );

    return useMemo(
        () => ({ language, setLanguage }),
        [language, setLanguage]
    );
}

// Re-export the raw react-i18next hook for cases that need full typing surface.
export { useI18nextTranslation as useI18nextTranslation };
