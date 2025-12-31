/**
 * HistoryChangeCard - Displays before/after comparisons for field changes.
 * Shows delta badges with directional arrows.
 */
import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { HistoryComparisonField, HistoryStatus } from '@/types/history';

interface HistoryChangeCardProps {
    title: string;
    fields: HistoryComparisonField[];
    className?: string;
}

const toneColors: Record<HistoryStatus, string> = {
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    danger: 'text-rose-400',
    neutral: 'text-slate-400',
};

const deltaBgColors: Record<HistoryStatus, string> = {
    success: 'bg-emerald-500/10 border-emerald-500/20',
    warning: 'bg-amber-500/10 border-amber-500/20',
    danger: 'bg-rose-500/10 border-rose-500/20',
    neutral: 'bg-white/5 border-white/10',
};

export function HistoryChangeCard({ title, fields, className }: HistoryChangeCardProps) {
    if (!fields || fields.length === 0) {
        return null;
    }

    return (
        <div className={cn('glass-card p-4', className)}>
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">
                {title}
            </h4>

            <div className="space-y-3">
                {fields.map((field, index) => {
                    const isChanged = field.before !== field.after;
                    const tone = field.tone || (isChanged ? 'warning' : 'neutral');
                    const DirectionIcon = field.direction === 'up'
                        ? ArrowUp
                        : field.direction === 'down'
                            ? ArrowDown
                            : Minus;

                    return (
                        <div key={index} className="flex items-center gap-4">
                            {/* Label */}
                            <span className="text-xs font-medium text-slate-400 w-24 shrink-0">
                                {field.label}
                            </span>

                            {/* Before */}
                            <div className="flex-1 min-w-0">
                                <span className={cn(
                                    "text-sm font-mono",
                                    isChanged ? "text-slate-500 line-through" : "text-white"
                                )}>
                                    {field.before || '—'}
                                </span>
                            </div>

                            {/* Arrow */}
                            {isChanged && (
                                <span className="text-slate-600">→</span>
                            )}

                            {/* After */}
                            <div className="flex-1 min-w-0">
                                <span className={cn(
                                    "text-sm font-mono font-bold",
                                    toneColors[tone]
                                )}>
                                    {field.after || '—'}
                                </span>
                            </div>

                            {/* Delta badge */}
                            {field.delta && (
                                <span className={cn(
                                    "flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded border",
                                    deltaBgColors[tone],
                                    toneColors[tone]
                                )}>
                                    <DirectionIcon className="h-3 w-3" />
                                    {field.delta}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
