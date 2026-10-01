/**
 * HistoryChangeCard - Displays before/after comparisons for field changes.
 * Shows delta badges with directional arrows.
 */
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/hooks';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { HistoryComparisonField, HistoryStatus } from '@/types/history';

interface HistoryChangeCardProps {
    title: string;
    fields: HistoryComparisonField[];
    className?: string;
}

const toneColors: Record<HistoryStatus, string> = {
    success: 'text-success-text',
    warning: 'text-warning-text',
    danger: 'text-destructive',
    neutral: 'text-muted-foreground',
};

const deltaBgColors: Record<HistoryStatus, string> = {
    success: 'bg-success/10 border-success/20',
    warning: 'bg-warning/10 border-warning/20',
    danger: 'bg-destructive/10 border-destructive/20',
    neutral: 'bg-secondary border-border',
};

export function HistoryChangeCard({ title, fields, className }: HistoryChangeCardProps) {
    const { t } = useTranslation('common');

    if (!fields || fields.length === 0) {
        return null;
    }

    return (
        <div className={cn('glass-card p-6 overflow-hidden relative', className)}>
            {/* Background design element */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none" />

            <div className="flex items-center justify-between mb-8 border-b border-border pb-4">
                <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    {title}
                </h4>
                <div className="flex gap-12 text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                    <span className="w-24">{t('labels.baseline')}</span>
                    <span className="w-24">{t('labels.current')}</span>
                </div>
            </div>

            <div className="space-y-6">
                {fields.map((field, index) => {
                    const isChanged = field.before !== field.after;
                    const tone = field.tone || (isChanged ? 'warning' : 'neutral');
                    const DirectionIcon = field.direction === 'up'
                        ? ArrowUp
                        : field.direction === 'down'
                            ? ArrowDown
                            : Minus;

                    return (
                        <div key={index} className="group transition-all">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest group-hover:text-muted-foreground transition-colors">
                                    {field.label}
                                </span>
                                {field.delta && isChanged && (
                                    <span className={cn(
                                        "flex items-center gap-1 px-2 py-0.5 text-[9px] font-black rounded-full border transform group-hover:scale-105 transition-all uppercase tracking-tighter",
                                        deltaBgColors[tone],
                                        toneColors[tone]
                                    )}>
                                        <DirectionIcon className="h-2 w-2" />
                                        {field.delta}
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
                                {/* Before */}
                                <div className={cn(
                                    "px-3 py-2 rounded-lg border transition-all",
                                    "bg-nested border-border"
                                )}>
                                    <span className="text-sm font-bold text-foreground truncate block">
                                        {field.before || '—'}
                                    </span>
                                </div>

                                {/* Transition */}
                                <div className="flex items-center justify-center">
                                    <div className={cn(
                                        "w-4 h-px bg-secondary relative",
                                        isChanged && "bg-accent/30"
                                    )}>
                                        {isChanged && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 bg-accent/50 rotate-45" />}
                                    </div>
                                </div>

                                {/* After */}
                                <div className={cn(
                                    "px-3 py-2 rounded-lg border transition-all shadow-lg shadow-black/20",
                                    isChanged ? "bg-accent/5 border-accent/20" : "bg-nested border-border"
                                )}>
                                    <span className={cn(
                                        "text-sm font-bold truncate block",
                                        isChanged ? toneColors[tone] : "text-foreground"
                                    )}>
                                        {field.after || '—'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

