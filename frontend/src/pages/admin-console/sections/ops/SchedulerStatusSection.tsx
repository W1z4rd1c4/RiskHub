import { Card } from '@/components/ui/card';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { translateCode } from '@/lib/humanizeCode';
import { cn } from '@/lib/utils';
import type { SchedulerStatus } from '@/services/adminApi';

interface SchedulerStatusSectionProps {
    schedulerStatus: SchedulerStatus | undefined;
}

export function SchedulerStatusSection({ schedulerStatus }: SchedulerStatusSectionProps) {
    const { t } = useTranslation('admin');
    const format = useFormat();
    const jobStatusLabel = (status: string) => translateCode(t, 'health.job_status', status);

    return (
        <div className="rounded-2xl border border-border bg-tint/5 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h3 className="text-base font-semibold text-foreground">{t('health.scheduler.title')}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">{t('health.scheduler.subtitle')}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm lg:min-w-[360px]">
                    <div className="rounded-xl bg-nested px-3 py-2 text-nested-foreground">
                        <p className="text-muted-foreground">{t('health.scheduler.process_role')}</p>
                        <p className="text-foreground mt-1 font-medium">{schedulerStatus?.process_role || t('common:fallbacks.unknown')}</p>
                    </div>
                    <div className="rounded-xl bg-nested px-3 py-2 text-nested-foreground">
                        <p className="text-muted-foreground">{t('health.scheduler.lock_state')}</p>
                        <p className={cn(
                            'mt-1 font-medium',
                            schedulerStatus?.lock_acquired ? 'text-success-text' : 'text-warning-text',
                        )}>
                            {schedulerStatus?.lock_acquired ? t('health.scheduler.lock_held') : t('health.scheduler.lock_not_held')}
                        </p>
                    </div>
                    <div className="rounded-xl bg-nested px-3 py-2 text-nested-foreground">
                        <p className="text-muted-foreground">{t('health.scheduler.current_owner')}</p>
                        <p className="text-foreground mt-1 break-all font-medium">
                            {schedulerStatus?.current_owner_instance_id || t('health.scheduler.none_reported')}
                        </p>
                    </div>
                    <div className="rounded-xl bg-nested px-3 py-2 text-nested-foreground">
                        <p className="text-muted-foreground">{t('health.scheduler.lock_provider')}</p>
                        <p className="text-foreground mt-1 font-medium">{schedulerStatus?.lock_provider || t('common:fallbacks.not_available')}</p>
                    </div>
                </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <Card tone="nested" padding="compact">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground">{t('health.scheduler.running_jobs')}</h4>
                        <span className="text-muted-foreground text-xs">{schedulerStatus?.running_jobs.length || 0}</span>
                    </div>
                    {schedulerStatus?.running_jobs.length ? (
                        <div className="mt-3 space-y-3">
                            {schedulerStatus.running_jobs.map((job) => (
                                <div key={job.run_id} className="rounded-lg bg-tint/5 px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-foreground text-sm font-medium">{job.job_name}</p>
                                        <span className="text-xs text-accent-text">{jobStatusLabel(job.status)}</span>
                                    </div>
                                    <p className="text-muted-foreground mt-1 text-xs">
                                        {format.dateTime(job.started_at)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground mt-3 text-sm">{t('health.scheduler.no_running_jobs')}</p>
                    )}
                </Card>

                <Card tone="nested" padding="compact">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground">{t('health.scheduler.latest_runs')}</h4>
                        <span className="text-muted-foreground text-xs">{schedulerStatus?.latest_runs.length || 0}</span>
                    </div>
                    <div className="mt-3 space-y-3">
                        {schedulerStatus?.latest_runs.length ? schedulerStatus.latest_runs.slice(0, 6).map((job) => (
                            <div key={job.run_id} className="rounded-lg bg-tint/5 px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-foreground text-sm font-medium">{job.job_name}</p>
                                    <span className={cn(
                                        'text-xs',
                                        job.status === 'succeeded' && 'text-success-text',
                                        job.status === 'failed' && 'text-destructive',
                                        job.status !== 'succeeded' && job.status !== 'failed' && 'text-foreground',
                                    )}>
                                        {jobStatusLabel(job.status)}
                                    </span>
                                </div>
                                <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
                                    <span>{format.dateTime(job.started_at)}</span>
                                    <span>{job.duration_ms ? format.number(job.duration_ms, { style: 'unit', unit: 'millisecond', unitDisplay: 'short' }) : t('common:fallbacks.not_available')}</span>
                                </div>
                                {job.error_message && (
                                    <p className="mt-1 text-xs text-destructive">{job.error_message}</p>
                                )}
                            </div>
                        )) : <p className="text-muted-foreground text-sm">{t('health.scheduler.no_runs')}</p>}
                    </div>
                </Card>
            </div>
        </div>
    );
}
