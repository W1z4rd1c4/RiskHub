import { Card } from '@/components/ui/card';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { translateCode } from '@/lib/humanizeCode';
import { cn } from '@/lib/utils';
import type { OutboxStatus } from '@/services/adminApi';

interface OutboxStatusSectionProps {
    outboxStatus: OutboxStatus | undefined;
}

export function OutboxStatusSection({ outboxStatus }: OutboxStatusSectionProps) {
    const { t } = useTranslation('admin');
    const format = useFormat();
    const statusLabel = (status: string) => translateCode(t, 'health.job_status', status);

    return (
        <Card tone="nested" padding="compact">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">{t('health.outbox.title')}</h3>
                    <p className="text-muted-foreground mt-1 text-xs">{t('health.outbox.subtitle')}</p>
                </div>
                <span className={cn(
                    'text-xs font-medium',
                    (outboxStatus?.dead_letter_count || 0) > 0 ? 'text-destructive' : 'text-success-text',
                )}>
                    {(outboxStatus?.dead_letter_count || 0) > 0 ? t('health.outbox.attention') : t('health.outbox.healthy')}
                </span>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-4 text-sm">
                <div className="rounded-lg bg-tint/5 px-3 py-2">
                    <p className="text-muted-foreground">{t('health.outbox.pending')}</p>
                    <p className="text-foreground mt-1 font-medium">{outboxStatus?.pending_count || 0}</p>
                </div>
                <div className="rounded-lg bg-tint/5 px-3 py-2">
                    <p className="text-muted-foreground">{t('health.outbox.processing')}</p>
                    <p className="text-foreground mt-1 font-medium">{outboxStatus?.processing_count || 0}</p>
                </div>
                <div className="rounded-lg bg-tint/5 px-3 py-2">
                    <p className="text-muted-foreground">{t('health.outbox.dead_letter')}</p>
                    <p className={cn(
                        'mt-1 font-medium',
                        (outboxStatus?.dead_letter_count || 0) > 0 ? 'text-destructive' : 'text-foreground',
                    )}>
                        {outboxStatus?.dead_letter_count || 0}
                    </p>
                </div>
                <div className="rounded-lg bg-tint/5 px-3 py-2">
                    <p className="text-muted-foreground">{t('health.outbox.oldest_pending')}</p>
                    <p className="text-foreground mt-1 font-medium">
                        {outboxStatus?.oldest_pending_age_seconds != null
                            ? format.number(outboxStatus.oldest_pending_age_seconds, { style: 'unit', unit: 'second', unitDisplay: 'short' })
                            : t('health.outbox.none')}
                    </p>
                </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg bg-tint/5 px-3 py-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('health.outbox.last_dispatch')}
                    </h4>
                    <div className="text-foreground mt-2 space-y-1 text-sm">
                        <p>{t('health.outbox.status')}: {outboxStatus?.last_dispatch_status ? statusLabel(outboxStatus.last_dispatch_status) : t('health.outbox.none')}</p>
                        <p>{t('health.outbox.processed')}: {outboxStatus?.last_dispatch_processed ?? 0}</p>
                        <p>{t('health.outbox.started')}: {outboxStatus?.last_dispatch_started_at ? format.dateTime(outboxStatus.last_dispatch_started_at) : t('health.outbox.none')}</p>
                        <p>{t('health.outbox.finished')}: {outboxStatus?.last_dispatch_finished_at ? format.dateTime(outboxStatus.last_dispatch_finished_at) : t('health.outbox.none')}</p>
                        {outboxStatus?.last_dispatch_error && (
                            <p className="text-destructive">{outboxStatus.last_dispatch_error}</p>
                        )}
                    </div>
                </div>

                <div className="rounded-lg bg-tint/5 px-3 py-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('health.outbox.recent_failures')}
                    </h4>
                    {outboxStatus?.recent_failures.length ? (
                        <div className="mt-2 space-y-2">
                            {outboxStatus.recent_failures.map((failure) => (
                                <div key={failure.id} className="rounded-lg bg-tint/5 px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-foreground text-sm font-medium">{failure.event_type}</p>
                                        <span className="text-xs text-destructive">{statusLabel(failure.status)}</span>
                                    </div>
                                    <p className="text-muted-foreground mt-1 text-xs">
                                        {t('health.outbox.attempts')}: {failure.attempt_count}
                                    </p>
                                    {failure.last_error && (
                                        <p className="mt-1 text-xs text-destructive">{failure.last_error}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground mt-2 text-sm">{t('health.outbox.no_failures')}</p>
                    )}
                </div>
            </div>
        </Card>
    );
}
