function resolveLocale(locale: string | null | undefined): string {
    return locale?.trim() || 'en';
}

function coerceDateValue(value: Date | string | null | undefined): Date | null {
    if (!value) {
        return null;
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
    if (value === null || value === undefined) {
        return '';
    }

    return new Intl.NumberFormat(resolveLocale(locale), options).format(value);
}

export function formatMetricNumberValue(
    value: number | null | undefined,
    locale: string | null | undefined,
): string {
    if (value === null || value === undefined) {
        return '';
    }
    if (value === 0) {
        return '0';
    }
    if (Math.abs(value) < 1) {
        return formatNumberValue(value, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (Math.abs(value) < 100) {
        return formatNumberValue(value, locale, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    }
    return formatNumberValue(Math.round(value), locale);
}
