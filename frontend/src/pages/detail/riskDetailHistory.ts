import { formatDateValue, formatMetricNumberValue } from '@/i18n/formatters';
import type { HistoryTimelineItem } from '@/types/history';
import type { KeyRiskIndicator, KRIHistoryEntry } from '@/types/kri';

export interface RiskKriHistoryResult {
    kri: Pick<KeyRiskIndicator, 'id' | 'metric_name'>;
    items: KRIHistoryEntry[];
}

interface BuildRiskKriHistoryItemsOptions {
    language: string;
    recordedByLabel: string;
    systemLabel: string;
}

export function buildRiskKriHistoryItems(
    results: RiskKriHistoryResult[],
    options: BuildRiskKriHistoryItemsOptions,
): HistoryTimelineItem[] {
    const timelineItems = results.flatMap(({ kri, items }) => items.map((entry) => ({
        id: `${kri.id}-${entry.id}`,
        title: `${kri.metric_name}: ${formatMetricNumberValue(entry.value, options.language)} ${entry.unit}`,
        subtitle: `Period end ${formatDateValue(entry.period_end, options.language)}`,
        timestamp: entry.recorded_at,
        status: entry.breach_status === 'within' ? 'success' as const : 'danger' as const,
        badge: entry.breach_status === 'within' ? 'OK' : 'BREACH',
        meta: [
            { label: 'KRI', value: kri.metric_name },
            { label: options.recordedByLabel, value: entry.recorded_by_name ?? options.systemLabel },
        ],
    })));

    return timelineItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
