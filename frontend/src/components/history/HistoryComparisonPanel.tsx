/**
 * HistoryComparisonPanel - Side-by-side comparison of two KRI history entries.
 * Shows deltas, breach status changes, and formatted diffs.
 */
import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { HistoryChangeCard } from './HistoryChangeCard';
import type { KRIHistoryEntry } from '@/types/kri';
import type { HistoryComparisonField, HistoryStatus } from '@/types/history';

interface HistoryComparisonPanelProps {
    entries: KRIHistoryEntry[];
    formatValue?: (n: number) => string;
    className?: string;
}

const defaultFormat = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 2 });

export function HistoryComparisonPanel({
    entries,
    formatValue = defaultFormat,
    className,
}: HistoryComparisonPanelProps) {
    // Sort by period_end descending (most recent first)
    const sortedEntries = useMemo(() => {
        return [...entries].sort((a, b) =>
            new Date(b.period_end).getTime() - new Date(a.period_end).getTime()
        );
    }, [entries]);

    // Initialize with two most recent entries
    const [leftId, setLeftId] = useState<number | null>(null);
    const [rightId, setRightId] = useState<number | null>(null);

    useEffect(() => {
        if (sortedEntries.length >= 2) {
            setLeftId(sortedEntries[1].id); // Previous
            setRightId(sortedEntries[0].id); // Latest
        } else if (sortedEntries.length === 1) {
            setLeftId(sortedEntries[0].id);
            setRightId(null);
        } else {
            setLeftId(null);
            setRightId(null);
        }
    }, [sortedEntries]);

    const leftEntry = sortedEntries.find(e => e.id === leftId);
    const rightEntry = sortedEntries.find(e => e.id === rightId);

    const isSameSelection = leftId !== null && leftId === rightId;

    // Build comparison fields
    const comparisonFields = useMemo<HistoryComparisonField[]>(() => {
        if (!leftEntry || !rightEntry || isSameSelection) return [];

        const formatDate = (d: string) => new Date(d).toLocaleDateString('cs-CZ');

        // Determine tone based on breach status change
        const getBreachTone = (): HistoryStatus => {
            if (leftEntry.breach_status === rightEntry.breach_status) return 'neutral';
            if (rightEntry.breach_status === 'within') return 'success';
            return 'danger';
        };

        // Calculate value delta
        const valueDelta = rightEntry.value - leftEntry.value;
        const valueDeltaStr = valueDelta >= 0 ? `+${formatValue(valueDelta)}` : formatValue(valueDelta);
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
                label: 'Value',
                before: `${formatValue(leftEntry.value)} ${leftEntry.unit}`,
                after: `${formatValue(rightEntry.value)} ${rightEntry.unit}`,
                delta: `${valueDeltaStr} ${rightEntry.unit}`,
                direction: valueDirection as 'up' | 'down' | 'flat',
                tone: getValueTone(),
            },
            {
                label: 'Breach Status',
                before: leftEntry.breach_status.toUpperCase(),
                after: rightEntry.breach_status.toUpperCase(),
                tone: getBreachTone(),
            },
            {
                label: 'Period End',
                before: formatDate(leftEntry.period_end),
                after: formatDate(rightEntry.period_end),
            },
            {
                label: 'Lower Limit',
                before: `${formatValue(leftEntry.lower_limit)} ${leftEntry.unit}`,
                after: `${formatValue(rightEntry.lower_limit)} ${rightEntry.unit}`,
                delta: leftEntry.lower_limit !== rightEntry.lower_limit
                    ? `${rightEntry.lower_limit - leftEntry.lower_limit >= 0 ? '+' : ''}${formatValue(rightEntry.lower_limit - leftEntry.lower_limit)}`
                    : undefined,
                direction: rightEntry.lower_limit > leftEntry.lower_limit ? 'up' : rightEntry.lower_limit < leftEntry.lower_limit ? 'down' : 'flat',
            },
            {
                label: 'Upper Limit',
                before: `${formatValue(leftEntry.upper_limit)} ${leftEntry.unit}`,
                after: `${formatValue(rightEntry.upper_limit)} ${rightEntry.unit}`,
                delta: leftEntry.upper_limit !== rightEntry.upper_limit
                    ? `${rightEntry.upper_limit - leftEntry.upper_limit >= 0 ? '+' : ''}${formatValue(rightEntry.upper_limit - leftEntry.upper_limit)}`
                    : undefined,
                direction: rightEntry.upper_limit > leftEntry.upper_limit ? 'up' : rightEntry.upper_limit < leftEntry.upper_limit ? 'down' : 'flat',
            },
            {
                label: 'Recorded By',
                before: leftEntry.recorded_by_name || 'System',
                after: rightEntry.recorded_by_name || 'System',
            },
        ];
    }, [leftEntry, rightEntry, isSameSelection, formatValue]);

    // Format option label
    const formatOptionLabel = (entry: KRIHistoryEntry) => {
        const date = new Date(entry.period_end).toLocaleDateString('cs-CZ');
        return `${date} (${formatValue(entry.value)} ${entry.unit})`;
    };

    if (sortedEntries.length < 2) {
        return (
            <div className={cn('text-center py-8 text-slate-500 text-sm', className)}>
                Need at least 2 history entries to compare.
            </div>
        );
    }

    return (
        <div className={cn('space-y-6', className)}>
            {/* Selector row */}
            <div className="flex items-center gap-4 flex-wrap">
                {/* Left selector (previous/baseline) */}
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                        From (Baseline)
                    </label>
                    <select
                        value={leftId ?? ''}
                        onChange={(e) => setLeftId(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:border-accent/50 focus:ring-1 focus:ring-accent/30 outline-none"
                    >
                        {sortedEntries.map(entry => (
                            <option key={entry.id} value={entry.id} className="bg-slate-900">
                                {formatOptionLabel(entry)}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center justify-center pt-6">
                    <ArrowRight className="h-5 w-5 text-slate-600" />
                </div>

                {/* Right selector (current/target) */}
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                        To (Current)
                    </label>
                    <select
                        value={rightId ?? ''}
                        onChange={(e) => setRightId(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:border-accent/50 focus:ring-1 focus:ring-accent/30 outline-none"
                    >
                        {sortedEntries.map(entry => (
                            <option key={entry.id} value={entry.id} className="bg-slate-900">
                                {formatOptionLabel(entry)}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Warning if same selection */}
            {isSameSelection && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Please select two different periods to compare.</span>
                </div>
            )}

            {/* Comparison card */}
            {!isSameSelection && comparisonFields.length > 0 && (
                <HistoryChangeCard
                    title="Period Comparison"
                    fields={comparisonFields}
                />
            )}
        </div>
    );
}
