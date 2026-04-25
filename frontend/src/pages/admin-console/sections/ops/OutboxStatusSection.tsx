import { useTranslation } from '@/i18n/hooks';
import { formatDateTimeValue } from '@/i18n/formatters';
import { cn } from '@/lib/utils';
import type { OutboxStatus } from '@/services/adminApi';

interface OutboxStatusSectionProps {
    outboxStatus: OutboxStatus | undefined;
}

export function OutboxStatusSection({ outboxStatus }: OutboxStatusSectionProps) {
    const { t, i18n } = useTranslation('admin');

    return (
        <div className="admin-surface-elevated rounded-xl border p-4">
            <div className="flex items-center justify-between">
                <div>
                    <h5 className="admin-title text-sm font-semibold">{t('health.outbox.title')}</h5>
                    <p className="admin-subtle mt-1 text-xs">{t('health.outbox.subtitle')}</p>
                </div>
                <span className={cn(
                    'text-xs font-medium',
                    (outboxStatus?.dead_letter_count || 0) > 0 ? 'text-rose-400' : 'text-emerald-400',
                )}>
                    {(outboxStatus?.dead_letter_count || 0) > 0 ? t('health.outbox.attention') : t('health.outbox.healthy')}
                </span>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-4 text-sm">
                <div className="admin-surface-muted rounded-lg px-3 py-2">
                    <p className="admin-subtle">{t('health.outbox.pending')}</p>
                    <p className="admin-title mt-1 font-medium">{outboxStatus?.pending_count || 0}</p>
                </div>
                <div className="admin-surface-muted rounded-lg px-3 py-2">
                    <p className="admin-subtle">{t('health.outbox.processing')}</p>
                    <p className="admin-title mt-1 font-medium">{outboxStatus?.processing_count || 0}</p>
                </div>
                <div className="admin-surface-muted rounded-lg px-3 py-2">
                    <p className="admin-subtle">{t('health.outbox.dead_letter')}</p>
                    <p className={cn(
                        'mt-1 font-medium',
                        (outboxStatus?.dead_letter_count || 0) > 0 ? 'text-rose-400' : 'admin-title',
                    )}>
                        {outboxStatus?.dead_letter_count || 0}
                    </p>
                </div>
                <div className="admin-surface-muted rounded-lg px-3 py-2">
                    <p className="admin-subtle">{t('health.outbox.oldest_pending')}</p>
                    <p className="admin-title mt-1 font-medium">
                        {outboxStatus?.oldest_pending_age_seconds != null
                            ? `${outboxStatus.oldest_pending_age_seconds}s`
                            : t('health.outbox.none')}
                    </p>
                </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="admin-surface-muted rounded-lg px-3 py-3">
                    <h6 className="admin-muted text-xs font-semibold uppercase tracking-wider">
                        {t('health.outbox.last_dispatch')}
                    </h6>
                    <div className="admin-text mt-2 space-y-1 text-sm">
                        <p>{t('health.outbox.status')}: {outboxStatus?.last_dispatch_status || t('health.outbox.none')}</p>
                        <p>{t('health.outbox.processed')}: {outboxStatus?.last_dispatch_processed ?? 0}</p>
                        <p>{t('health.outbox.started')}: {outboxStatus?.last_dispatch_started_at ? formatDateTimeValue(outboxStatus.last_dispatch_started_at, i18n.language) : t('health.outbox.none')}</p>
                        <p>{t('health.outbox.finished')}: {outboxStatus?.last_dispatch_finished_at ? formatDateTimeValue(outboxStatus.last_dispatch_finished_at, i18n.language) : t('health.outbox.none')}</p>
                        {outboxStatus?.last_dispatch_error && (
                            <p className="text-rose-300">{outboxStatus.last_dispatch_error}</p>
                        )}
                    </div>
                </div>

                <div className="admin-surface-muted rounded-lg px-3 py-3">
                    <h6 className="admin-muted text-xs font-semibold uppercase tracking-wider">
                        {t('health.outbox.recent_failures')}
                    </h6>
                    {outboxStatus?.recent_failures.length ? (
                        <div className="mt-2 space-y-2">
                            {outboxStatus.recent_failures.map((failure) => (
                                <div key={failure.id} className="admin-surface-elevated rounded-lg px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="admin-title text-sm font-medium">{failure.event_type}</p>
                                        <span className="text-xs text-rose-300">{failure.status}</span>
                                    </div>
                                    <p className="admin-muted mt-1 text-xs">
                                        {t('health.outbox.attempts')}: {failure.attempt_count}
                                    </p>
                                    {failure.last_error && (
                                        <p className="mt-1 text-xs text-rose-300">{failure.last_error}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="admin-subtle mt-2 text-sm">{t('health.outbox.no_failures')}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
