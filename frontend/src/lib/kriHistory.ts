import { formatDateValue } from '@/i18n/formatters';

export const KRI_HISTORY_PAGE_SIZE = 50;

// KRI periods are calendar dates, not instants in the viewer's timezone.
export function formatKriPeriodDate(value: string, locale: string): string {
    return formatDateValue(value, locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    });
}
