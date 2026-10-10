function resolveLocale(locale: string | null | undefined): string {
    return locale?.trim() || 'en';
}

/** `YYYY-MM-DD` with no time part: a calendar date, not an instant. */
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a calendar date (`2026-09-30`) as local midnight. `new Date('2026-09-30')`
 * is UTC midnight, which every timezone west of UTC displays as the previous day.
 * Impossible dates (`2026-02-30`) are invalid instead of rolling over.
 */
function parseDateOnly(value: string): Date | null | undefined {
    const match = DATE_ONLY_PATTERN.exec(value);
    if (!match) return undefined;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function coerceDateValue(value: Date | string | null | undefined): Date | null {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        const dateOnly = parseDateOnly(value.trim());
        if (dateOnly !== undefined) return dateOnly;
    }
    const date = typeof value === 'string' ? new Date(value) : value;
    return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateValue(
    date: Date | string | null | undefined,
    locale: string | null | undefined,
    options?: Intl.DateTimeFormatOptions,
): string {
    const dateObj = coerceDateValue(date);
    if (!dateObj) {
        return '';
    }

    const defaultOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    };

    return new Intl.DateTimeFormat(resolveLocale(locale), options || defaultOptions).format(dateObj);
}

export function formatDateTimeValue(
    date: Date | string | null | undefined,
    locale: string | null | undefined,
    options?: Intl.DateTimeFormatOptions,
): string {
    const dateObj = coerceDateValue(date);
    if (!dateObj) {
        return '';
    }

    const defaultOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    };

    return new Intl.DateTimeFormat(resolveLocale(locale), options || defaultOptions).format(dateObj);
}

export function formatTimeValue(
    date: Date | string | null | undefined,
    locale: string | null | undefined,
    options?: Intl.DateTimeFormatOptions,
): string {
    return formatDateTimeValue(date, locale, {
        hour: '2-digit',
        minute: '2-digit',
        ...(options ?? {}),
    });
}

export function formatRelativeDateValue(
    date: Date | string | null | undefined,
    locale: string | null | undefined,
): string {
    const dateObj = coerceDateValue(date);
    if (!dateObj) {
        return '';
    }

    const diffMs = dateObj.getTime() - Date.now();
    const absMs = Math.abs(diffMs);
    const formatter = new Intl.RelativeTimeFormat(resolveLocale(locale), { numeric: 'auto' });

    if (absMs < 60_000) {
        return formatter.format(Math.round(diffMs / 1_000), 'second');
    }
    if (absMs < 3_600_000) {
        return formatter.format(Math.round(diffMs / 60_000), 'minute');
    }
    if (absMs < 86_400_000) {
        return formatter.format(Math.round(diffMs / 3_600_000), 'hour');
    }
    if (absMs < 604_800_000) {
        return formatter.format(Math.round(diffMs / 86_400_000), 'day');
    }
    if (absMs < 2_592_000_000) {
        return formatter.format(Math.round(diffMs / 604_800_000), 'week');
    }
    if (absMs < 31_536_000_000) {
        return formatter.format(Math.round(diffMs / 2_592_000_000), 'month');
    }

    return formatter.format(Math.round(diffMs / 31_536_000_000), 'year');
}

export function formatNumberValue(
    value: number | null | undefined,
    locale: string | null | undefined,
    options?: Intl.NumberFormatOptions,
): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '';
    }

    return new Intl.NumberFormat(resolveLocale(locale), options).format(value);
}

/**
 * Metric value with magnitude-aware precision. `unit` is an Intl sanctioned
 * unit identifier (`day`, `hour`, `percent`, …), rendered in its short form.
 */
export function formatMetricNumberValue(
    value: number | null | undefined,
    locale: string | null | undefined,
    unit?: string,
): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '';
    }
    const unitOptions: Intl.NumberFormatOptions = unit ? { style: 'unit', unit, unitDisplay: 'short' } : {};
    if (value === 0) {
        return formatNumberValue(0, locale, unitOptions);
    }
    if (Math.abs(value) < 1) {
        return formatNumberValue(value, locale, { ...unitOptions, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (Math.abs(value) < 100) {
        return formatNumberValue(value, locale, { ...unitOptions, minimumFractionDigits: 0, maximumFractionDigits: 1 });
    }
    return formatNumberValue(Math.round(value), locale, unitOptions);
}

/** `value` is a ratio: `0.42` → "42%" (en) / "42 %" (cs). */
export function formatPercentValue(
    value: number | null | undefined,
    locale: string | null | undefined,
    fractionDigits = 0,
): string {
    return formatNumberValue(value, locale, {
        style: 'percent',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    });
}

/** Whole-unit currency amount (`CZK` by default), e.g. "CZK 1,500" (en) / "1 500 Kč" (cs). */
export function formatCurrencyValue(
    value: number | null | undefined,
    locale: string | null | undefined,
    currency = 'CZK',
): string {
    return formatNumberValue(value, locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}
