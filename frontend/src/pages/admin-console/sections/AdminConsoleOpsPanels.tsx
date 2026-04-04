import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/i18n/hooks';
import { Users, RefreshCw, Database, Clock, MemoryStick, UserX } from 'lucide-react';

import { adminApi, type ActiveSession } from '@/services/adminApi';
import { useAdaptivePollingQuery } from '@/hooks/useAdaptivePollingQuery';
import { cn } from '@/lib/utils';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { formatDateTimeValue } from '@/i18n/formatters';

export function HealthPanel() {
    const { t, i18n } = useTranslation('admin');
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
    const schedulerStatus = schedulerQuery.data;
    const outboxStatus = outboxQuery.data;

    if (healthQuery.isLoading) {
        return <div className="text-slate-400 text-center py-8">{t('health.loading')}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{t('health.title')}</h3>
                <button
                    onClick={() => {
                        void healthQuery.refresh();
                        void schedulerQuery.refresh();
                        void outboxQuery.refresh();
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                    <RefreshCw className="h-4 w-4" />
                    {t('health.refresh')}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Database className={cn(
                            "h-5 w-5",
                            health?.database_status === 'connected' ? 'text-green-400' : 'text-red-400'
                        )} />
                        <span className="text-slate-400 text-sm">{t('health.database')}</span>
                    </div>
                    <p className={cn(
                        "text-xl font-bold",
                        health?.database_status === 'connected' ? 'text-green-400' : 'text-red-400'
                    )}>
                        {health?.database_status === 'connected' ? t('health.connected') : t('health.error')}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        {t('health.latency')}: {health?.database_latency_ms?.toFixed(2)}ms
                    </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Clock className="h-5 w-5 text-blue-400" />
                        <span className="text-slate-400 text-sm">{t('health.uptime')}</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                        {Math.floor((health?.uptime_seconds || 0) / 3600)}h {Math.floor(((health?.uptime_seconds || 0) % 3600) / 60)}m
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        {t('health.since_restart')}
                    </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <MemoryStick className="h-5 w-5 text-purple-400" />
                        <span className="text-slate-400 text-sm">{t('health.memory')}</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                        {health?.memory_usage_mb?.toFixed(0)} MB
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        {t('health.process_memory')}
                    </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Users className="h-5 w-5 text-amber-400" />
                        <span className="text-slate-400 text-sm">{t('health.active_users')}</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                        {stats?.active_users_24h || 0}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        {t('health.in_last_24h')}
                    </p>
                </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h4 className="text-base font-semibold text-white">{t('health.scheduler.title')}</h4>
                        <p className="mt-1 text-sm text-slate-400">{t('health.scheduler.subtitle')}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm lg:min-w-[360px]">
                        <div className="rounded-xl bg-slate-950/50 px-3 py-2">
                            <p className="text-slate-500">{t('health.scheduler.process_role')}</p>
                            <p className="mt-1 font-medium text-white">{schedulerStatus?.process_role || 'unknown'}</p>
                        </div>
                        <div className="rounded-xl bg-slate-950/50 px-3 py-2">
                            <p className="text-slate-500">{t('health.scheduler.lock_state')}</p>
                            <p className={cn(
                                'mt-1 font-medium',
                                schedulerStatus?.lock_acquired ? 'text-emerald-400' : 'text-amber-300'
                            )}>
                                {schedulerStatus?.lock_acquired ? t('health.scheduler.lock_held') : t('health.scheduler.lock_not_held')}
                            </p>
                        </div>
                        <div className="rounded-xl bg-slate-950/50 px-3 py-2">
                            <p className="text-slate-500">{t('health.scheduler.current_owner')}</p>
                            <p className="mt-1 font-medium text-white break-all">
                                {schedulerStatus?.current_owner_instance_id || t('health.scheduler.none_reported')}
                            </p>
                        </div>
                        <div className="rounded-xl bg-slate-950/50 px-3 py-2">
                            <p className="text-slate-500">{t('health.scheduler.lock_provider')}</p>
                            <p className="mt-1 font-medium text-white">{schedulerStatus?.lock_provider || 'n/a'}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                        <div className="flex items-center justify-between">
                            <h5 className="text-sm font-semibold text-white">{t('health.scheduler.running_jobs')}</h5>
                            <span className="text-xs text-slate-500">{schedulerStatus?.running_jobs.length || 0}</span>
                        </div>
                        {schedulerStatus?.running_jobs.length ? (
                            <div className="mt-3 space-y-3">
                                {schedulerStatus.running_jobs.map((job) => (
                                    <div key={job.run_id} className="rounded-lg bg-white/5 px-3 py-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-medium text-white">{job.job_name}</p>
                                            <span className="text-xs text-sky-300">{job.status}</span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-400">
                                            {formatDateTimeValue(job.started_at, i18n.language)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-3 text-sm text-slate-500">{t('health.scheduler.no_running_jobs')}</p>
                        )}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                        <div className="flex items-center justify-between">
                            <h5 className="text-sm font-semibold text-white">{t('health.scheduler.latest_runs')}</h5>
                            <span className="text-xs text-slate-500">{schedulerStatus?.latest_runs.length || 0}</span>
                        </div>
                        <div className="mt-3 space-y-3">
                            {schedulerStatus?.latest_runs.length ? schedulerStatus.latest_runs.slice(0, 6).map((job) => (
                                <div key={job.run_id} className="rounded-lg bg-white/5 px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-medium text-white">{job.job_name}</p>
                                        <span className={cn(
                                            'text-xs',
                                            job.status === 'succeeded' && 'text-emerald-400',
                                            job.status === 'failed' && 'text-rose-400',
                                            job.status !== 'succeeded' && job.status !== 'failed' && 'text-slate-300'
                                        )}>
                                            {job.status}
                                        </span>
                                    </div>
                                    <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                                        <span>{formatDateTimeValue(job.started_at, i18n.language)}</span>
                                        <span>{job.duration_ms ? `${job.duration_ms}ms` : 'n/a'}</span>
                                    </div>
                                    {job.error_message && (
                                        <p className="mt-1 text-xs text-rose-300">{job.error_message}</p>
                                    )}
                                </div>
                            )) : <p className="text-sm text-slate-500">{t('health.scheduler.no_runs')}</p>}
                        </div>
                    </div>
                </div>

                <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h5 className="text-sm font-semibold text-white">{t('health.outbox.title')}</h5>
                            <p className="mt-1 text-xs text-slate-500">{t('health.outbox.subtitle')}</p>
                        </div>
                        <span className={cn(
                            'text-xs font-medium',
                            (outboxStatus?.dead_letter_count || 0) > 0 ? 'text-rose-400' : 'text-emerald-400',
                        )}>
                            {(outboxStatus?.dead_letter_count || 0) > 0 ? t('health.outbox.attention') : t('health.outbox.healthy')}
                        </span>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-4 text-sm">
                        <div className="rounded-lg bg-white/5 px-3 py-2">
                            <p className="text-slate-500">{t('health.outbox.pending')}</p>
                            <p className="mt-1 font-medium text-white">{outboxStatus?.pending_count || 0}</p>
                        </div>
                        <div className="rounded-lg bg-white/5 px-3 py-2">
                            <p className="text-slate-500">{t('health.outbox.processing')}</p>
                            <p className="mt-1 font-medium text-white">{outboxStatus?.processing_count || 0}</p>
                        </div>
                        <div className="rounded-lg bg-white/5 px-3 py-2">
                            <p className="text-slate-500">{t('health.outbox.dead_letter')}</p>
                            <p className={cn(
                                'mt-1 font-medium',
                                (outboxStatus?.dead_letter_count || 0) > 0 ? 'text-rose-400' : 'text-white',
                            )}>
                                {outboxStatus?.dead_letter_count || 0}
                            </p>
                        </div>
                        <div className="rounded-lg bg-white/5 px-3 py-2">
                            <p className="text-slate-500">{t('health.outbox.oldest_pending')}</p>
                            <p className="mt-1 font-medium text-white">
                                {outboxStatus?.oldest_pending_age_seconds != null
                                    ? `${outboxStatus.oldest_pending_age_seconds}s`
                                    : t('health.outbox.none')}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-lg bg-white/5 px-3 py-3">
                            <h6 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                {t('health.outbox.last_dispatch')}
                            </h6>
                            <div className="mt-2 space-y-1 text-sm text-slate-300">
                                <p>{t('health.outbox.status')}: {outboxStatus?.last_dispatch_status || t('health.outbox.none')}</p>
                                <p>{t('health.outbox.processed')}: {outboxStatus?.last_dispatch_processed ?? 0}</p>
                                <p>{t('health.outbox.started')}: {outboxStatus?.last_dispatch_started_at ? formatDateTimeValue(outboxStatus.last_dispatch_started_at, i18n.language) : t('health.outbox.none')}</p>
                                <p>{t('health.outbox.finished')}: {outboxStatus?.last_dispatch_finished_at ? formatDateTimeValue(outboxStatus.last_dispatch_finished_at, i18n.language) : t('health.outbox.none')}</p>
                                {outboxStatus?.last_dispatch_error && (
                                    <p className="text-rose-300">{outboxStatus.last_dispatch_error}</p>
                                )}
                            </div>
                        </div>

                        <div className="rounded-lg bg-white/5 px-3 py-3">
                            <h6 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                {t('health.outbox.recent_failures')}
                            </h6>
                            {outboxStatus?.recent_failures.length ? (
                                <div className="mt-2 space-y-2">
                                    {outboxStatus.recent_failures.map((failure) => (
                                        <div key={failure.id} className="rounded-lg bg-slate-950/50 px-3 py-2">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-sm font-medium text-white">{failure.event_type}</p>
                                                <span className="text-xs text-rose-300">{failure.status}</span>
                                            </div>
                                            <p className="mt-1 text-xs text-slate-400">
                                                {t('health.outbox.attempts')}: {failure.attempt_count}
                                            </p>
                                            {failure.last_error && (
                                                <p className="mt-1 text-xs text-rose-300">{failure.last_error}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-2 text-sm text-slate-500">{t('health.outbox.no_failures')}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function LogsPanel() {
    const { t, i18n } = useTranslation('admin');
    const [eventFilter, setEventFilter] = useState<string>('');

    const { data: logs, isLoading } = useQuery({
        queryKey: ['adminLogs', eventFilter],
        queryFn: () => adminApi.getTechnicalLogs({ event_type: eventFilter || undefined, limit: 100 }),
    });

    if (isLoading) {
        return <div className="text-slate-400 text-center py-8">{t('application_logs.loading')}</div>;
    }

    const eventTypes = [...new Set(logs?.map(l => l.event_type) || [])];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{t('application_logs.title')}</h3>
                <ThemedSelect
                    value={eventFilter}
                    onValueChange={setEventFilter}
                    placeholder={t('application_logs.all_events')}
                    allowEmpty
                    emptyLabel={t('application_logs.all_events')}
                    options={eventTypes.map(type => ({ value: type, label: type }))}
                />
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-900">
                        <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">{t('application_logs.columns.time')}</th>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">{t('application_logs.columns.level')}</th>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">{t('application_logs.columns.event')}</th>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">{t('application_logs.columns.user')}</th>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">{t('application_logs.columns.details')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs?.map((log) => (
                            <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                                <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                                    {formatDateTimeValue(log.timestamp, i18n.language)}
                                </td>
                                <td className="py-2 px-3">
                                    <span className={cn(
                                        "px-2 py-0.5 rounded text-xs font-medium",
                                        log.level === 'INFO' && "bg-blue-500/20 text-blue-400",
                                        log.level === 'WARNING' && "bg-amber-500/20 text-amber-400",
                                        log.level === 'ERROR' && "bg-red-500/20 text-red-400"
                                    )}>
                                        {log.level}
                                    </span>
                                </td>
                                <td className="py-2 px-3 text-white">{log.event_type}</td>
                                <td className="py-2 px-3 text-slate-400">{log.user_name || t('common:fallbacks.unknown_user')}</td>
                                <td className="py-2 px-3 text-slate-500 max-w-xs truncate" title={log.description || ''}>
                                    {log.description || t('common:fallbacks.not_available')}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function SessionsPanel() {
    const { t, i18n } = useTranslation('admin');
    const queryClient = useQueryClient();
    const [pendingRevokeSession, setPendingRevokeSession] = useState<ActiveSession | null>(null);
    const [directorySummary, setDirectorySummary] = useState<string | null>(null);
    const [directorySyncing, setDirectorySyncing] = useState(false);

    const { data: sessions, isLoading } = useQuery({
        queryKey: ['adminSessions'],
        queryFn: () => adminApi.getActiveSessions(),
    });

    const revokeMutation = useMutation({
        mutationFn: (userId: number) => adminApi.revokeSession(userId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminSessions'] }),
    });

    const handleConfirmRevoke = () => {
        if (!pendingRevokeSession) return;
        revokeMutation.mutate(pendingRevokeSession.user_id, {
            onSettled: () => setPendingRevokeSession(null),
        });
    };

    const handleCheckAllDirectory = async () => {
        try {
            setDirectorySyncing(true);
            const result = await adminApi.checkAllDirectoryUsers();
            setDirectorySummary(
                t('users.directory_check_all_success', {
                    defaultValue: `Checked ${result.checked} users (${result.deprovisioned} deprovisioned).`,
                    checked: result.checked,
                    deprovisioned: result.deprovisioned,
                }),
            );
            void queryClient.invalidateQueries({ queryKey: ['adminSessions'] });
        } catch (error) {
            console.error('Directory check-all failed', error);
            setDirectorySummary(t('users.directory_check_failed', { defaultValue: 'Directory check failed.' }));
        } finally {
            setDirectorySyncing(false);
        }
    };

    if (isLoading) {
        return <div className="text-slate-400 text-center py-8">{t('sessions.loading')}</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{t('sessions.title')}</h3>
                <div className="flex items-center gap-3">
                    <p className="text-sm text-slate-500">
                        {t('sessions.description')}
                    </p>
                    <button
                        onClick={handleCheckAllDirectory}
                        disabled={directorySyncing}
                        className="inline-flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <RefreshCw className={cn('h-3.5 w-3.5', directorySyncing && 'animate-spin')} />
                        {directorySyncing
                            ? t('users.checking_directory', { defaultValue: 'Checking...' })
                            : t('users.check_directory', { defaultValue: 'Check AD' })}
                    </button>
                </div>
            </div>

            {directorySummary && (
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                    {directorySummary}
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.user')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.email')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.role')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.department')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.last_activity')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.status')}</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sessions?.map((session) => {
                            // Calculate status and duration
                            const lastActivityDate = new Date(session.last_activity);
                            const lastLoginDate = session.last_login ? new Date(session.last_login) : null;
                            const now = new Date();

                            // Online threshold: 10 minutes
                            const minutesSinceActivity = Math.floor((now.getTime() - lastActivityDate.getTime()) / 60000);
                            const isOnline = session.is_active && minutesSinceActivity < 10;
                            const isRevoked = !session.is_active;

                            let statusColor = "bg-slate-500";
                            let statusText = t('sessions.offline');
                            let durationText = "";

                            if (isRevoked) {
                                statusColor = "bg-red-500";
                                statusText = t('sessions.revoked');
                            } else if (isOnline) {
                                statusColor = "bg-emerald-500";
                                statusText = t('sessions.online');
                                if (lastLoginDate) {
                                    const onlineMinutes = Math.floor((now.getTime() - lastLoginDate.getTime()) / 60000);
                                    const hours = Math.floor(onlineMinutes / 60);
                                    const mins = onlineMinutes % 60;
                                    durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                                }
                            } else {
                                // Offline
                                const hours = Math.floor(minutesSinceActivity / 60);
                                const mins = minutesSinceActivity % 60;
                                durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                            }

                            return (
                                <tr key={session.user_id} className="border-b border-white/5 hover:bg-white/5">
                                    <td className="py-3 px-4 text-white font-medium">{session.user_name}</td>
                                    <td className="py-3 px-4 text-slate-400">{session.user_email}</td>
                                    <td className="py-3 px-4">
                                        <span className="px-2 py-0.5 bg-white/10 text-slate-300 text-xs rounded-full">
                                            {session.role}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-slate-400">{session.department || t('common:fallbacks.not_available')}</td>
                                    <td className="py-3 px-4 text-slate-500">
                                        {formatDateTimeValue(lastActivityDate, i18n.language)}
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-2 h-2 rounded-full", statusColor)} />
                                            <div className="flex flex-col">
                                                <span className="text-white text-sm font-medium">{statusText}</span>
                                                {durationText && (
                                                    <span className="text-xs text-slate-500">{durationText}</span>
                                                )}
                                                <span className="text-xs text-slate-500">
                                                    {session.active_sessions} {t('sessions.devices', { defaultValue: 'devices' })}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        {!isRevoked && (
                                            <button
                                                onClick={() => setPendingRevokeSession(session)}
                                                className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors ml-auto"
                                            >
                                                <UserX className="h-4 w-4" />
                                                {t('sessions.revoke')}
                                            </button>
                                        )}
                                        {isRevoked && (
                                            <span className="text-xs text-red-500 font-medium px-3 py-1.5">{t('sessions.access_revoked')}</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <ConfirmDialog
                isOpen={pendingRevokeSession !== null}
                onClose={() => setPendingRevokeSession(null)}
                onConfirm={handleConfirmRevoke}
                title={t('sessions.revoke')}
                message={t('sessions.revoke_confirm', { name: pendingRevokeSession?.user_name ?? '' })}
                confirmLabel={t('sessions.revoke')}
                variant="warning"
                isLoading={revokeMutation.isPending}
            />
        </div>
    );
}
