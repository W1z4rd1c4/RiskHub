/**
 * HistoryTimeline - Vertical timeline for displaying historical events.
 * Renders a visual rail with status-colored dots and event details.
 */
import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/tones';
import { Edit3 } from 'lucide-react';
import type { HistoryTimelineItem, HistoryStatus } from '@/types/history';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, LoadingState } from '@/components/ui/state';

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

/** History statuses are the semantic tones the `Badge` primitive already knows. */
const META_TONES: Record<HistoryStatus, Tone> = {
    success: 'success',
    warning: 'warning',
    danger: 'danger',
    neutral: 'neutral',
};

export function HistoryTimeline({
    items,
    loading = false,
    emptyMessage,
    className,
    onItemAction,
    actionLabel
}: HistoryTimelineProps) {
    const { t } = useTranslation('common');
    const format = useFormat();
    const resolvedEmptyMessage = emptyMessage ?? t('empty.no_history_available');
    const resolvedActionLabel = actionLabel ?? t('actions.request_correction');

    if (loading) {
        return (
            <LoadingState className={className} />
        );
    }

    if (!items || items.length === 0) {
        return (
            <EmptyState layout="inline" icon={null} title={resolvedEmptyMessage} className={cn('justify-center py-12', className)} />
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
                                "flex-1 glass-card p-4 transition-colors group-hover:bg-tint/[0.03]",
                                statusBorderColors[status]
                            )}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-bold text-foreground truncate">{item.title}</h4>
                                            {item.badge && (
                                                <Badge tone="accent" shape="rounded">{item.badge}</Badge>
                                            )}
                                        </div>
                                        {item.subtitle && (
                                            <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
                                        )}
                                    </div>
                                    <time className="text-eyebrow shrink-0">
                                        {format.relative(item.timestamp)}
                                    </time>
                                </div>

                                {/* Meta pills */}
                                {item.meta && item.meta.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                        {item.meta.map((m, i) => (
                                            <Badge key={i} tone={META_TONES[m.tone || 'neutral']} shape="rounded">
                                                {t('common:labels.label_value', { label: m.label, value: m.value })}
                                            </Badge>
                                        ))}
                                    </div>
                                )}

                                {/* Action button */}
                                {onItemAction && (
                                    <Button
                                        variant="outline"
                                        size="compact"
                                        className="mt-3"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onItemAction(item);
                                        }}
                                    >
                                        <Edit3 aria-hidden="true" />
                                        {resolvedActionLabel}
                                    </Button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
