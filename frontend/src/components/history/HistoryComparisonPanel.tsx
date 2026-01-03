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
        <div className={cn('space-y-8', className)}>
            {/* Header / Selector row */}
            <div className="flex items-center justify-between gap-6 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent/10 rounded-lg">
                        <ArrowRight className="h-4 w-4 text-accent rotate-45" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider">Compare Records</h4>
                        <p className="text-[10px] text-slate-500 font-medium">Analyze changes between two reporting periods</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-white/5 p-1.5 rounded-xl border border-white/10 ml-auto">
                    {/* Left selector (previous/baseline) */}
                    <div className="relative group">
                        <select
                            value={leftId ?? ''}
                            onChange={(e) => setLeftId(e.target.value ? parseInt(e.target.value) : null)}
                            className="bg-transparent pl-3 pr-8 py-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors outline-none cursor-pointer appearance-none rounded-lg hover:bg-white/5"
                        >
                            {sortedEntries.map(entry => (
                                <option key={entry.id} value={entry.id} className="bg-[#0f172a] text-white">
                                    {formatOptionLabel(entry)}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 group-hover:text-slate-400 transition-colors">
                            <ArrowRight className="h-3 w-3 rotate-90 scale-75" />
                        </div>
                    </div>

                    <div className="w-px h-4 bg-white/10" />

                    {/* Right selector (current/target) */}
                    <div className="relative group">
                        <select
                            value={rightId ?? ''}
                            onChange={(e) => setRightId(e.target.value ? parseInt(e.target.value) : null)}
                            className="bg-transparent pl-3 pr-8 py-1.5 text-xs font-black text-accent hover:text-accent/80 transition-colors outline-none cursor-pointer appearance-none rounded-lg hover:bg-white/5"
                        >
                            {sortedEntries.map(entry => (
                                <option key={entry.id} value={entry.id} className="bg-[#0f172a] text-white">
                                    {formatOptionLabel(entry)}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-accent/50 group-hover:text-accent transition-colors">
                            <ArrowRight className="h-3 w-3 rotate-90 scale-75" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Warning if same selection */}
            {isSameSelection && (
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/[0.03] border border-amber-500/10 rounded-xl text-amber-500/80 text-xs font-medium backdrop-blur-sm animate-pulse">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Difference calculation requires two distinct periods.</span>
                </div>
            )}

            {/* Comparison card */}
            {!isSameSelection && comparisonFields.length > 0 && (
                <div className="relative">
                    {/* Decorative line connecting selectors to card */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-px h-8 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

                    <HistoryChangeCard
                        title="Delta Analysis"
                        fields={comparisonFields}
                        className="shadow-2xl shadow-accent/5"
                    />
                </div>
            )}
        </div>
    );
}

