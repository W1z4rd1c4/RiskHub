/**
 * HistoryComparisonPanel - Side-by-side comparison of two KRI history entries.
 * Shows deltas, breach status changes, and formatted diffs.
 */
import { useState, useMemo } from 'react';
import { formatKriPeriodDate } from '@/lib/kriHistory';
import { formatKriUnit } from '@/lib/kriUnits';
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { HistoryChangeCard } from './HistoryChangeCard';
import type { KRIHistoryEntry } from '@/types/kri';
import type { HistoryComparisonField, HistoryStatus } from '@/types/history';
import { InlineMessage } from '@/components/ui/inline-message';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useFormat, useTranslation, type SafeTFunction } from '@/i18n/hooks';

/** GAP-D-04: translated breach status (never the raw upper-cased enum). Literal keys for the usage validator. */
const BREACH_STATUS_LABEL_KEYS: Readonly<Record<string, string>> = {
    within: 'kris:breach_status.within',
    above: 'kris:breach_status.above',
    below: 'kris:breach_status.below',
};

function breachStatusLabel(status: string, t: SafeTFunction): string {
    const key = BREACH_STATUS_LABEL_KEYS[status];
    return key ? t(key) : status;
}

/** GAP-D-03: a value with its translated unit suffix (which agrees with the value). */
function formatWithUnit(
    value: number,
    unit: string | null | undefined,
    formatValue: (n: number) => string,
    t: SafeTFunction,
): string {
    const suffix = formatKriUnit(unit, t, value);
    return suffix ? `${formatValue(value)} ${suffix}` : formatValue(value);
}

interface HistoryComparisonPanelProps {
    entries: KRIHistoryEntry[];
    formatValue?: (n: number) => string;
    className?: string;
}

export function HistoryComparisonPanel({
    entries,
    formatValue,
    className,
}: HistoryComparisonPanelProps) {
    const { t } = useTranslation(['kris', 'common']);
    const format = useFormat();
    const resolvedFormatValue = useMemo(
        () => formatValue ?? ((n: number) => format.number(n, { maximumFractionDigits: 2 })),
        [formatValue, format],
    );

    // Sort by period_end descending (most recent first)
    const sortedEntries = useMemo(() => {
        return [...entries].sort((a, b) =>
            new Date(b.period_end).getTime() - new Date(a.period_end).getTime()
        );
    }, [entries]);

    const entryIds = useMemo(() => new Set(sortedEntries.map((e) => e.id)), [sortedEntries]);

    const defaultLeftId =
        sortedEntries.length >= 2 ? sortedEntries[1].id :
            sortedEntries.length === 1 ? sortedEntries[0].id :
                null;

    const defaultRightId = sortedEntries.length >= 1 ? sortedEntries[0].id : null;

    const [selectedLeftId, setSelectedLeftId] = useState<number | null>(null);
    const [selectedRightId, setSelectedRightId] = useState<number | null>(null);

    const leftId =
        selectedLeftId !== null && entryIds.has(selectedLeftId)
            ? selectedLeftId
            : defaultLeftId;

    const rightId =
        selectedRightId !== null && entryIds.has(selectedRightId)
            ? selectedRightId
            : defaultRightId;

    const leftEntry = sortedEntries.find(e => e.id === leftId);
    const rightEntry = sortedEntries.find(e => e.id === rightId);

    const isSameSelection = leftId !== null && leftId === rightId;

    // Build comparison fields
    const comparisonFields = useMemo<HistoryComparisonField[]>(() => {
        if (!leftEntry || !rightEntry || isSameSelection) return [];

        const formatDate = (d: string) => formatKriPeriodDate(d, format.locale);

        // Determine tone based on breach status change
        const getBreachTone = (): HistoryStatus => {
            if (leftEntry.breach_status === rightEntry.breach_status) return 'neutral';
            if (rightEntry.breach_status === 'within') return 'success';
            return 'danger';
        };

        // Calculate value delta
        const valueDelta = rightEntry.value - leftEntry.value;
        const valueDeltaStr = valueDelta >= 0 ? `+${resolvedFormatValue(valueDelta)}` : resolvedFormatValue(valueDelta);
        const valueDirection = valueDelta > 0 ? 'up' : valueDelta < 0 ? 'down' : 'flat';

        // Value tone - depends on whether moving toward limits
        const getValueTone = (): HistoryStatus => {
            if (rightEntry.breach_status !== 'within' && leftEntry.breach_status === 'within') {
                return 'danger';
            }
            if (rightEntry.breach_status === 'within' && leftEntry.breach_status !== 'within') {
                return 'success';
            }
            return 'neutral';
        };

        return [
            {
                label: t('common:labels.value'),
                before: formatWithUnit(leftEntry.value, leftEntry.unit, resolvedFormatValue, t),
                after: formatWithUnit(rightEntry.value, rightEntry.unit, resolvedFormatValue, t),
                delta: `${valueDeltaStr} ${formatKriUnit(rightEntry.unit, t, rightEntry.value - leftEntry.value)}`.trim(),
                direction: valueDirection as 'up' | 'down' | 'flat',
                tone: getValueTone(),
            },
            {
                label: t('comparison.breach_status', { ns: 'kris' }),
                before: breachStatusLabel(leftEntry.breach_status, t),
                after: breachStatusLabel(rightEntry.breach_status, t),
                tone: getBreachTone(),
            },
            {
                label: t('comparison.period_end', { ns: 'kris' }),
                before: formatDate(leftEntry.period_end),
                after: formatDate(rightEntry.period_end),
            },
            {
                label: t('comparison.lower_limit', { ns: 'kris' }),
                before: formatWithUnit(leftEntry.lower_limit, leftEntry.unit, resolvedFormatValue, t),
                after: formatWithUnit(rightEntry.lower_limit, rightEntry.unit, resolvedFormatValue, t),
                delta: leftEntry.lower_limit !== rightEntry.lower_limit
                    ? `${rightEntry.lower_limit - leftEntry.lower_limit >= 0 ? '+' : ''}${resolvedFormatValue(rightEntry.lower_limit - leftEntry.lower_limit)}`
                    : undefined,
                direction: rightEntry.lower_limit > leftEntry.lower_limit ? 'up' : rightEntry.lower_limit < leftEntry.lower_limit ? 'down' : 'flat',
            },
            {
                label: t('comparison.upper_limit', { ns: 'kris' }),
                before: formatWithUnit(leftEntry.upper_limit, leftEntry.unit, resolvedFormatValue, t),
                after: formatWithUnit(rightEntry.upper_limit, rightEntry.unit, resolvedFormatValue, t),
                delta: leftEntry.upper_limit !== rightEntry.upper_limit
                    ? `${rightEntry.upper_limit - leftEntry.upper_limit >= 0 ? '+' : ''}${resolvedFormatValue(rightEntry.upper_limit - leftEntry.upper_limit)}`
                    : undefined,
                direction: rightEntry.upper_limit > leftEntry.upper_limit ? 'up' : rightEntry.upper_limit < leftEntry.upper_limit ? 'down' : 'flat',
            },
            {
                label: t('comparison.recorded_by', { ns: 'kris' }),
                before: leftEntry.recorded_by_name || t('comparison.system', { ns: 'kris' }),
                after: rightEntry.recorded_by_name || t('comparison.system', { ns: 'kris' }),
            },
        ];
    }, [leftEntry, rightEntry, isSameSelection, resolvedFormatValue, t, format.locale]);

    // Format option label
    const formatOptionLabel = (entry: KRIHistoryEntry) => {
        const date = formatKriPeriodDate(entry.period_end, format.locale);
        return `${date} (${formatWithUnit(entry.value, entry.unit, resolvedFormatValue, t)})`;
    };

    if (sortedEntries.length < 2) {
        return (
            <div className={cn('text-center py-8 text-muted-foreground text-sm', className)}>
                {t('comparison.need_two_entries', { ns: 'kris' })}
            </div>
        );
    }

    return (
        <div className={cn('space-y-8', className)}>
            {/* Header / Selector row */}
            <div className="flex items-center justify-between gap-6 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent/10 rounded-lg">
                        <ArrowRight aria-hidden="true" className="h-4 w-4 text-accent-text rotate-45" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">{t('comparison.compare_records', { ns: 'kris' })}</h3>
                        <p className="text-xs text-muted-foreground font-medium">{t('comparison.analyze_changes', { ns: 'kris' })}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-secondary p-1.5 rounded-xl border border-border ml-auto">
                    {/* Left selector (previous/baseline) */}
                    <ThemedSelect
                        value={leftId?.toString() ?? ''}
                        triggerAriaLabel={t('comparison.baseline', { ns: 'kris' })}
                        triggerTestId="kri-comparison-baseline"
                        onValueChange={(v) => setSelectedLeftId(v ? parseInt(v) : null)}
                        className="min-w-[180px]"
                        options={sortedEntries.map(entry => ({ value: entry.id.toString(), label: formatOptionLabel(entry) }))}
                    />

                    <div className="w-px h-4 bg-secondary" />

                    {/* Right selector (current/target) */}
                    <ThemedSelect
                        value={rightId?.toString() ?? ''}
                        triggerAriaLabel={t('comparison.target', { ns: 'kris' })}
                        triggerTestId="kri-comparison-target"
                        onValueChange={(v) => setSelectedRightId(v ? parseInt(v) : null)}
                        className="min-w-[180px]"
                        options={sortedEntries.map(entry => ({ value: entry.id.toString(), label: formatOptionLabel(entry) }))}
                    />
                </div>
            </div>

            {/* Warning if same selection */}
            {isSameSelection && (
                <InlineMessage tone="warning" icon={AlertTriangle}>
                    {t('comparison.distinct_periods_required', { ns: 'kris' })}
                </InlineMessage>
            )}

            {/* Comparison card */}
            {!isSameSelection && comparisonFields.length > 0 && (
                <div className="relative">
                    {/* Decorative line connecting selectors to card */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-px h-8 bg-gradient-to-b from-tint/10 to-transparent pointer-events-none" />

                    <HistoryChangeCard
                        title={t('comparison.delta_analysis', { ns: 'kris' })}
                        fields={comparisonFields}
                        className="shadow-2xl shadow-accent/5"
                    />
                </div>
            )}
        </div>
    );
}
