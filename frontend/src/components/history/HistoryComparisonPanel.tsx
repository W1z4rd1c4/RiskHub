/**
 * HistoryComparisonPanel - Side-by-side comparison of two KRI history entries.
 * Shows deltas, breach status changes, and formatted diffs.
 */
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { HistoryChangeCard } from './HistoryChangeCard';
import type { KRIHistoryEntry } from '@/types/kri';
import type { HistoryComparisonField, HistoryStatus } from '@/types/history';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { formatDateValue, formatNumberValue } from '@/i18n/formatters';

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
    const { t, i18n } = useTranslation(['kris', 'common']);
    const resolvedFormatValue = useMemo(
        () => formatValue ?? ((n: number) => formatNumberValue(n, i18n.language, { maximumFractionDigits: 2 })),
        [formatValue, i18n.language],
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

        const formatDate = (d: string) => formatDateValue(d, i18n.language);

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
                before: `${resolvedFormatValue(leftEntry.value)} ${leftEntry.unit}`,
                after: `${resolvedFormatValue(rightEntry.value)} ${rightEntry.unit}`,
                delta: `${valueDeltaStr} ${rightEntry.unit}`,
                direction: valueDirection as 'up' | 'down' | 'flat',
                tone: getValueTone(),
            },
            {
                label: t('comparison.breach_status', { ns: 'kris' }),
                before: leftEntry.breach_status.toUpperCase(),
                after: rightEntry.breach_status.toUpperCase(),
                tone: getBreachTone(),
            },
            {
                label: t('comparison.period_end', { ns: 'kris' }),
                before: formatDate(leftEntry.period_end),
                after: formatDate(rightEntry.period_end),
            },
            {
                label: t('comparison.lower_limit', { ns: 'kris' }),
                before: `${resolvedFormatValue(leftEntry.lower_limit)} ${leftEntry.unit}`,
                after: `${resolvedFormatValue(rightEntry.lower_limit)} ${rightEntry.unit}`,
                delta: leftEntry.lower_limit !== rightEntry.lower_limit
                    ? `${rightEntry.lower_limit - leftEntry.lower_limit >= 0 ? '+' : ''}${resolvedFormatValue(rightEntry.lower_limit - leftEntry.lower_limit)}`
                    : undefined,
                direction: rightEntry.lower_limit > leftEntry.lower_limit ? 'up' : rightEntry.lower_limit < leftEntry.lower_limit ? 'down' : 'flat',
            },
            {
                label: t('comparison.upper_limit', { ns: 'kris' }),
                before: `${resolvedFormatValue(leftEntry.upper_limit)} ${leftEntry.unit}`,
                after: `${resolvedFormatValue(rightEntry.upper_limit)} ${rightEntry.unit}`,
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
    }, [leftEntry, rightEntry, isSameSelection, resolvedFormatValue, t, i18n.language]);

    // Format option label
    const formatOptionLabel = (entry: KRIHistoryEntry) => {
        const date = formatDateValue(entry.period_end, i18n.language);
        return `${date} (${resolvedFormatValue(entry.value)} ${entry.unit})`;
    };

    if (sortedEntries.length < 2) {
        return (
            <div className={cn('text-center py-8 text-slate-500 text-sm', className)}>
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
                        <ArrowRight className="h-4 w-4 text-accent rotate-45" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider">{t('comparison.compare_records', { ns: 'kris' })}</h4>
                        <p className="text-[10px] text-slate-500 font-medium">{t('comparison.analyze_changes', { ns: 'kris' })}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-white/5 p-1.5 rounded-xl border border-white/10 ml-auto">
                    {/* Left selector (previous/baseline) */}
                    <ThemedSelect
                        value={leftId?.toString() ?? ''}
                        onValueChange={(v) => setSelectedLeftId(v ? parseInt(v) : null)}
                        className="min-w-[180px]"
                        options={sortedEntries.map(entry => ({ value: entry.id.toString(), label: formatOptionLabel(entry) }))}
                    />

                    <div className="w-px h-4 bg-white/10" />

                    {/* Right selector (current/target) */}
                    <ThemedSelect
                        value={rightId?.toString() ?? ''}
                        onValueChange={(v) => setSelectedRightId(v ? parseInt(v) : null)}
                        className="min-w-[180px]"
                        options={sortedEntries.map(entry => ({ value: entry.id.toString(), label: formatOptionLabel(entry) }))}
                    />
                </div>
            </div>

            {/* Warning if same selection */}
            {isSameSelection && (
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/[0.03] border border-amber-500/10 rounded-xl text-amber-500/80 text-xs font-medium backdrop-blur-sm animate-pulse">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{t('comparison.distinct_periods_required', { ns: 'kris' })}</span>
                </div>
            )}

            {/* Comparison card */}
            {!isSameSelection && comparisonFields.length > 0 && (
                <div className="relative">
                    {/* Decorative line connecting selectors to card */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-px h-8 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

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
