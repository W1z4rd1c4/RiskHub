/**
 * HistoryTimeline - Vertical timeline for displaying historical events.
 * Renders a visual rail with status-colored dots and event details.
 */
import { cn } from '@/lib/utils';
import { Loader2, Edit3 } from 'lucide-react';
import type { HistoryTimelineItem, HistoryStatus } from '@/types/history';
import { useTranslation } from '@/i18n/hooks';
import { formatRelativeDateValue } from '@/i18n/formatters';

interface HistoryTimelineProps {
    items: HistoryTimelineItem[];
    loading?: boolean;
    emptyMessage?: string;
    className?: string;
    onItemAction?: (item: HistoryTimelineItem) => void;
    actionLabel?: string;
}

const statusColors: Record<HistoryStatus, string> = {
    success: 'bg-success text-success-foreground border-success-text',
    warning: 'bg-warning text-warning-foreground border-warning-text',
    danger: 'bg-destructive text-destructive-foreground border-destructive',
    neutral: 'bg-secondary text-secondary-foreground border-icon-muted',
};

const statusBorderColors: Record<HistoryStatus, string> = {
    success: 'border-success/30',
    warning: 'border-warning/30',
    danger: 'border-destructive/30',
    neutral: 'border-border',
};

const metaToneColors: Record<HistoryStatus, string> = {
    success: 'bg-success/10 text-success-text border-success/20',
    warning: 'bg-warning/10 text-warning-text border-warning/20',
    danger: 'bg-destructive/10 text-destructive border-destructive/20',
    neutral: 'bg-secondary text-muted-foreground border-border',
};

export function HistoryTimeline({
    items,
    loading = false,
    emptyMessage,
    className,
    onItemAction,
    actionLabel
}: HistoryTimelineProps) {
    const { t, i18n } = useTranslation('common');
    const resolvedEmptyMessage = emptyMessage ?? t('empty.no_history_available');
    const resolvedActionLabel = actionLabel ?? t('actions.request_correction');

    if (loading) {
        return (
            <div className={cn('flex items-center justify-center py-12', className)}>
                <Loader2 className="h-8 w-8 text-accent-text animate-spin" />
            </div>
        );
    }

    if (!items || items.length === 0) {
        return (
            <div className={cn('text-center py-12 text-muted-foreground text-sm', className)}>
                {resolvedEmptyMessage}
            </div>
        );
    }

    return (
        <div className={cn('relative', className)}>
            {/* Vertical rail */}
            <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-secondary" />

            <div className="space-y-4">
                {items.map((item) => {
                    const status = item.status || 'neutral';
                    const IconComponent = item.icon;
                    const isIconElement = IconComponent && typeof IconComponent !== 'function';
                    const isIconComponent = IconComponent && typeof IconComponent === 'function';

                    return (
                        <div key={item.id} className="relative flex gap-4 group">
                            {/* Status dot */}
                            <div className={cn(
                                "relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2",
                                statusColors[status]
                            )}>
                                {isIconComponent && (
                                    <IconComponent className="h-3 w-3" />
                                )}
                                {isIconElement && IconComponent}
                            </div>

                            {/* Content */}
                            <div className={cn(
                                "flex-1 glass-card p-4 transition-colors group-hover:bg-white/[0.03]",
                                statusBorderColors[status]
                            )}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-bold text-foreground truncate">{item.title}</h4>
                                            {item.badge && (
                                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-accent/20 text-accent-text border border-accent/30">
                                                    {item.badge}
                                                </span>
                                            )}
                                        </div>
                                        {item.subtitle && (
                                            <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
                                        )}
                                    </div>
                                    <time className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                                        {formatRelativeDateValue(item.timestamp, i18n.language)}
                                    </time>
                                </div>

                                {/* Meta pills */}
                                {item.meta && item.meta.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                        {item.meta.map((m, i) => (
                                            <span
                                                key={i}
                                                className={cn(
                                                    "px-2 py-0.5 text-[10px] font-medium rounded border",
                                                    metaToneColors[m.tone || 'neutral']
                                                )}
                                            >
                                                {m.label}: {m.value}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Action button */}
                                {onItemAction && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onItemAction(item);
                                        }}
                                        className="mt-3 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-secondary hover:bg-secondary border border-border hover:border-input rounded-lg transition-colors flex items-center gap-1.5"
                                    >
                                        <Edit3 className="h-3 w-3" />
                                        {resolvedActionLabel}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
