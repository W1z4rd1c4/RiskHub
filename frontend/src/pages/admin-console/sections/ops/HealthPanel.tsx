import { useQuery } from '@tanstack/react-query';
import { Clock, Database, MemoryStick, RefreshCw, Users } from 'lucide-react';

import { useAdaptivePollingQuery } from '@/hooks/useAdaptivePollingQuery';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { adminKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { adminApi } from '@/services/adminApi';

import { OutboxStatusSection } from './OutboxStatusSection';
import { SchedulerStatusSection } from './SchedulerStatusSection';
import { ErrorState, LoadingState } from '@/components/ui/state';

export function HealthPanel() {
    const { t } = useTranslation('admin');
    const format = useFormat();
    const healthQuery = useAdaptivePollingQuery({
        queryKey: adminKeys.health(),
        queryFn: ({ signal }) => adminApi.getSystemHealth({ signal }),
        pollMs: 30000,
    });
    const schedulerQuery = useAdaptivePollingQuery({
        queryKey: adminKeys.schedulerStatus(),
        queryFn: ({ signal }) => adminApi.getSchedulerStatus({ signal }),
        pollMs: 30000,
    });
    const outboxQuery = useAdaptivePollingQuery({
        queryKey: adminKeys.outboxStatus(),
        queryFn: ({ signal }) => adminApi.getOutboxStatus({ signal }),
        pollMs: 30000,
    });

    const { data: stats } = useQuery({
        queryKey: adminKeys.stats(),
        queryFn: () => adminApi.getSystemStats(),
    });

    const health = healthQuery.data;
    const isRefreshing = healthQuery.isFetching || schedulerQuery.isFetching || outboxQuery.isFetching;

    if (healthQuery.isLoading) {
        return <LoadingState label={t('health.loading')} />;
    }

    // GAP-D-17: without health data the cards would read "Error"/"0h 0m" and
    // misreport the system; show the load failure instead.
    if (!health) {
        return (
            <ErrorState
                title={t('health.title')}
                onRetry={() => void healthQuery.refresh()}
                isRetrying={healthQuery.isFetching}
            />
        );
    }

    // GAP-D-17: units go through Intl (locale-aware), and a metric the API did not
    // report reads as an em dash instead of "0h 0m" / "NaN MB".
    const noValue = '—';
    const formatUnit = (value: number | null | undefined, unit: string, options?: Intl.NumberFormatOptions) =>
        format.number(value, { style: 'unit', unit, unitDisplay: 'short', ...options }) || noValue;
    const uptimeSeconds = health.uptime_seconds;
    const uptimeText = uptimeSeconds == null
        ? noValue
        : [
            format.number(Math.floor(uptimeSeconds / 3600), { style: 'unit', unit: 'hour', unitDisplay: 'narrow' }),
            format.number(Math.floor((uptimeSeconds % 3600) / 60), { style: 'unit', unit: 'minute', unitDisplay: 'narrow' }),
        ].join(' ');
    const isDatabaseConnected = health.database_status === 'connected';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">{t('health.title')}</h2>
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                        void healthQuery.refresh();
                        void schedulerQuery.refresh();
                        void outboxQuery.refresh();
                    }}
                    isLoading={isRefreshing}
                >
                    {!isRefreshing ? <RefreshCw className="h-4 w-4" aria-hidden="true" /> : null}
                    {t('health.refresh')}
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card tone="nested" padding="compact">
                    <div className="flex items-center gap-3 mb-2">
                        <Database aria-hidden="true" className={cn(
                            'h-5 w-5',
                            isDatabaseConnected ? 'text-success-text' : 'text-destructive',
                        )} />
                        <span className="text-sm text-muted-foreground">{t('health.database')}</span>
                    </div>
                    <p className={cn(
                        'text-xl font-bold',
                        isDatabaseConnected ? 'text-success-text' : 'text-destructive',
                    )}>
                        {isDatabaseConnected ? t('health.connected') : t('health.error')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {t('health.latency')}: {formatUnit(health.database_latency_ms, 'millisecond', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                    </p>
                </Card>

                <Card tone="nested" padding="compact">
                    <div className="flex items-center gap-3 mb-2">
                        <Clock aria-hidden="true" className="h-5 w-5 text-accent-text" />
                        <span className="text-sm text-muted-foreground">{t('health.uptime')}</span>
                    </div>
                    <p className="text-xl font-bold text-foreground">
                        {uptimeText}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {t('health.since_restart')}
                    </p>
                </Card>

                <Card tone="nested" padding="compact">
                    <div className="flex items-center gap-3 mb-2">
                        <MemoryStick aria-hidden="true" className="h-5 w-5 text-chart-2" />
                        <span className="text-sm text-muted-foreground">{t('health.memory')}</span>
                    </div>
                    <p className="text-xl font-bold text-foreground">
                        {formatUnit(health.memory_usage_mb, 'megabyte', { maximumFractionDigits: 0 })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {t('health.process_memory')}
                    </p>
                </Card>

                <Card tone="nested" padding="compact">
                    <div className="flex items-center gap-3 mb-2">
                        <Users aria-hidden="true" className="h-5 w-5 text-warning-text" />
                        <span className="text-sm text-muted-foreground">{t('health.active_users')}</span>
                    </div>
                    <p className="text-xl font-bold text-foreground">
                        {format.number(stats?.active_users_24h ?? 0)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {t('health.in_last_24h')}
                    </p>
                </Card>
            </div>

            <SchedulerStatusSection schedulerStatus={schedulerQuery.data} />
            <OutboxStatusSection outboxStatus={outboxQuery.data} />
        </div>
    );
}
