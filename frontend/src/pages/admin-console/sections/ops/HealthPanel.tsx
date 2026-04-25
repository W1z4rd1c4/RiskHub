import { useQuery } from '@tanstack/react-query';
import { Clock, Database, MemoryStick, RefreshCw, Users } from 'lucide-react';

import { useAdaptivePollingQuery } from '@/hooks/useAdaptivePollingQuery';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import { adminApi } from '@/services/adminApi';

import { OutboxStatusSection } from './OutboxStatusSection';
import { SchedulerStatusSection } from './SchedulerStatusSection';

export function HealthPanel() {
    const { t } = useTranslation('admin');
    const healthQuery = useAdaptivePollingQuery({
        queryKey: ['adminHealth'],
        queryFn: ({ signal }) => adminApi.getSystemHealth({ signal }),
        pollMs: 30000,
    });
    const schedulerQuery = useAdaptivePollingQuery({
        queryKey: ['adminSchedulerStatus'],
        queryFn: ({ signal }) => adminApi.getSchedulerStatus({ signal }),
        pollMs: 30000,
    });
    const outboxQuery = useAdaptivePollingQuery({
        queryKey: ['adminOutboxStatus'],
        queryFn: ({ signal }) => adminApi.getOutboxStatus({ signal }),
        pollMs: 30000,
    });

    const { data: stats } = useQuery({
        queryKey: ['adminStats'],
        queryFn: () => adminApi.getSystemStats(),
    });

    const health = healthQuery.data;

    if (healthQuery.isLoading) {
        return <div className="admin-muted text-center py-8">{t('health.loading')}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="admin-title text-lg font-semibold">{t('health.title')}</h3>
                <button
                    onClick={() => {
                        void healthQuery.refresh();
                        void schedulerQuery.refresh();
                        void outboxQuery.refresh();
                    }}
                    className="admin-tab-inactive flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/10 rounded-lg transition-colors"
                >
                    <RefreshCw className="h-4 w-4" />
                    {t('health.refresh')}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="admin-surface-muted rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Database className={cn(
                            'h-5 w-5',
                            health?.database_status === 'connected' ? 'text-green-400' : 'text-red-400',
                        )} />
                        <span className="admin-muted text-sm">{t('health.database')}</span>
                    </div>
                    <p className={cn(
                        'text-xl font-bold',
                        health?.database_status === 'connected' ? 'text-green-400' : 'text-red-400',
                    )}>
                        {health?.database_status === 'connected' ? t('health.connected') : t('health.error')}
                    </p>
                    <p className="admin-subtle mt-1 text-xs">
                        {t('health.latency')}: {health?.database_latency_ms?.toFixed(2)}ms
                    </p>
                </div>

                <div className="admin-surface-muted rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Clock className="h-5 w-5 text-blue-400" />
                        <span className="admin-muted text-sm">{t('health.uptime')}</span>
                    </div>
                    <p className="admin-title text-xl font-bold">
                        {Math.floor((health?.uptime_seconds || 0) / 3600)}h {Math.floor(((health?.uptime_seconds || 0) % 3600) / 60)}m
                    </p>
                    <p className="admin-subtle mt-1 text-xs">
                        {t('health.since_restart')}
                    </p>
                </div>

                <div className="admin-surface-muted rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <MemoryStick className="h-5 w-5 text-purple-400" />
                        <span className="admin-muted text-sm">{t('health.memory')}</span>
                    </div>
                    <p className="admin-title text-xl font-bold">
                        {health?.memory_usage_mb?.toFixed(0)} MB
                    </p>
                    <p className="admin-subtle mt-1 text-xs">
                        {t('health.process_memory')}
                    </p>
                </div>

                <div className="admin-surface-muted rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Users className="h-5 w-5 text-amber-400" />
                        <span className="admin-muted text-sm">{t('health.active_users')}</span>
                    </div>
                    <p className="admin-title text-xl font-bold">
                        {stats?.active_users_24h || 0}
                    </p>
                    <p className="admin-subtle mt-1 text-xs">
                        {t('health.in_last_24h')}
                    </p>
                </div>
            </div>

            <SchedulerStatusSection schedulerStatus={schedulerQuery.data} />
            <OutboxStatusSection outboxStatus={outboxQuery.data} />
        </div>
    );
}
