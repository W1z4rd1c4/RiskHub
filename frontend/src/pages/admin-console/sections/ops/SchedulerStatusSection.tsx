import { useTranslation } from '@/i18n/hooks';
import { formatDateTimeValue } from '@/i18n/formatters';
import { cn } from '@/lib/utils';
import type { SchedulerStatus } from '@/services/adminApi';

interface SchedulerStatusSectionProps {
    schedulerStatus: SchedulerStatus | undefined;
}

export function SchedulerStatusSection({ schedulerStatus }: SchedulerStatusSectionProps) {
    const { t, i18n } = useTranslation('admin');

    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h4 className="admin-title text-base font-semibold">{t('health.scheduler.title')}</h4>
                    <p className="admin-muted mt-1 text-sm">{t('health.scheduler.subtitle')}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm lg:min-w-[360px]">
                    <div className="admin-surface-elevated rounded-xl px-3 py-2">
                        <p className="admin-subtle">{t('health.scheduler.process_role')}</p>
                        <p className="admin-title mt-1 font-medium">{schedulerStatus?.process_role || 'unknown'}</p>
                    </div>
                    <div className="admin-surface-elevated rounded-xl px-3 py-2">
                        <p className="admin-subtle">{t('health.scheduler.lock_state')}</p>
                        <p className={cn(
                            'mt-1 font-medium',
                            schedulerStatus?.lock_acquired ? 'text-emerald-400' : 'text-amber-300',
                        )}>
                            {schedulerStatus?.lock_acquired ? t('health.scheduler.lock_held') : t('health.scheduler.lock_not_held')}
                        </p>
                    </div>
                    <div className="admin-surface-elevated rounded-xl px-3 py-2">
                        <p className="admin-subtle">{t('health.scheduler.current_owner')}</p>
                        <p className="admin-title mt-1 break-all font-medium">
                            {schedulerStatus?.current_owner_instance_id || t('health.scheduler.none_reported')}
                        </p>
                    </div>
                    <div className="admin-surface-elevated rounded-xl px-3 py-2">
                        <p className="admin-subtle">{t('health.scheduler.lock_provider')}</p>
                        <p className="admin-title mt-1 font-medium">{schedulerStatus?.lock_provider || 'n/a'}</p>
                    </div>
                </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="admin-surface-elevated rounded-xl border p-4">
                    <div className="flex items-center justify-between">
                        <h5 className="admin-title text-sm font-semibold">{t('health.scheduler.running_jobs')}</h5>
                        <span className="admin-subtle text-xs">{schedulerStatus?.running_jobs.length || 0}</span>
                    </div>
                    {schedulerStatus?.running_jobs.length ? (
                        <div className="mt-3 space-y-3">
                            {schedulerStatus.running_jobs.map((job) => (
                                <div key={job.run_id} className="admin-surface-muted rounded-lg px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="admin-title text-sm font-medium">{job.job_name}</p>
                                        <span className="text-xs text-sky-300">{job.status}</span>
                                    </div>
                                    <p className="admin-muted mt-1 text-xs">
                                        {formatDateTimeValue(job.started_at, i18n.language)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="admin-subtle mt-3 text-sm">{t('health.scheduler.no_running_jobs')}</p>
                    )}
                </div>

                <div className="admin-surface-elevated rounded-xl border p-4">
                    <div className="flex items-center justify-between">
                        <h5 className="admin-title text-sm font-semibold">{t('health.scheduler.latest_runs')}</h5>
                        <span className="admin-subtle text-xs">{schedulerStatus?.latest_runs.length || 0}</span>
                    </div>
                    <div className="mt-3 space-y-3">
                        {schedulerStatus?.latest_runs.length ? schedulerStatus.latest_runs.slice(0, 6).map((job) => (
                            <div key={job.run_id} className="admin-surface-muted rounded-lg px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="admin-title text-sm font-medium">{job.job_name}</p>
                                    <span className={cn(
                                        'text-xs',
                                        job.status === 'succeeded' && 'text-emerald-400',
                                        job.status === 'failed' && 'text-rose-400',
                                        job.status !== 'succeeded' && job.status !== 'failed' && 'text-slate-300',
                                    )}>
                                        {job.status}
                                    </span>
                                </div>
                                <div className="admin-muted mt-1 flex items-center justify-between text-xs">
                                    <span>{formatDateTimeValue(job.started_at, i18n.language)}</span>
                                    <span>{job.duration_ms ? `${job.duration_ms}ms` : 'n/a'}</span>
                                </div>
                                {job.error_message && (
                                    <p className="mt-1 text-xs text-rose-300">{job.error_message}</p>
                                )}
                            </div>
                        )) : <p className="admin-subtle text-sm">{t('health.scheduler.no_runs')}</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}
