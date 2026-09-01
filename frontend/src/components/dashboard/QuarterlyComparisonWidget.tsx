import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar, RefreshCw } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

import { QuarterMetricCard } from './QuarterMetricCard';
import { QuarterPeriodSelector } from './QuarterPeriodSelector';
import { QuarterlyComparisonFrame, QuarterlyComparisonSkeleton } from './QuarterlyComparisonFrame';
import { SnapshotAvailabilityNotice } from './SnapshotAvailabilityNotice';
import {
    buildCompareQuarterOptions,
    buildCurrentQuarterOptions,
    buildYearOptions,
    getSnapshotAvailability,
} from './quarterlyComparisonPresentation';
import { useQuarterlyComparisonData } from './useQuarterlyComparisonData';

export function QuarterlyComparisonWidget() {
    const { t } = useTranslation('dashboard');
    const {
        actualCurrentQuarter,
        actualCurrentYear,
        availableYears,
        compareQuarter,
        compareYear,
        currentQuarter,
        currentYear,
        data,
        error,
        isLoading,
        setCompareQuarter,
        setCompareYear,
        setCurrentQuarter,
        setCurrentYear,
    } = useQuarterlyComparisonData();

    const metricLabels: Record<string, string> = useMemo(() => ({
        new_risks: t('quarterly.new_risks'),
        archived_risks: t('quarterly.archived_risks'),
        active_risks: t('quarterly.active_risks'),
        priority_risks: t('quarterly.priority_risks'),
        kri_breaches: t('quarterly.kri_breaches'),
        pending_approvals: t('quarterly.pending_approvals'),
        audit_activity: t('quarterly.audit_activity'),
        failed_audits: t('quarterly.failed_audits'),
        control_coverage: t('quarterly.control_coverage'),
        unaudited_controls: t('quarterly.unaudited_controls'),
        orphaned_items: t('quarterly.orphaned_items'),
        kri_health: t('quarterly.kri_health'),
        overdue_kris: t('quarterly.overdue_kris'),
        activity_volume: t('quarterly.activity_volume'),
        risks_without_kri: t('quarterly.risks_without_kri'),
        active_vendors: t('quarterly.active_vendors'),
    }), [t]);

    const yearOptions = useMemo(() => {
        return buildYearOptions(availableYears, currentYear, compareYear);
    }, [availableYears, compareYear, currentYear]);

    const currentQuarterOptions = buildCurrentQuarterOptions(
        currentYear,
        actualCurrentYear,
        actualCurrentQuarter,
    );
    const compareQuarterOptions = buildCompareQuarterOptions(compareYear, currentYear, currentQuarter);

    if (isLoading && !data) {
        return <QuarterlyComparisonSkeleton title={t('sections.quarterly_comparison')} />;
    }

    if (error && !data) {
        return (
            <QuarterlyComparisonFrame title={t('sections.quarterly_comparison')}>
                <p className="text-slate-500 text-sm">{error || t('quarterly.no_data_available')}</p>
            </QuarterlyComparisonFrame>
        );
    }

    const metrics = Object.keys(metricLabels);
    const snapshot = getSnapshotAvailability(data);
    const flowObservation = data?.metric_observations?.new_risks;
    const currentSource = flowObservation?.current.source ?? 'live';
    const compareSource = flowObservation?.compare.source ?? 'live';

    const sourceLabel = (source: 'live' | 'stored' | 'missing') => t(`quarterly.source.${source}`);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card"
        >
            {/* Header with title */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-bold text-white">{t('sections.quarterly_comparison')}</h3>
                </div>
                {isLoading && (
                    <RefreshCw className="h-4 w-4 text-slate-400 animate-spin" />
                )}
            </div>

            <QuarterPeriodSelector
                compareQuarter={compareQuarter}
                compareQuarterOptions={compareQuarterOptions}
                compareYear={compareYear}
                currentQuarter={currentQuarter}
                currentQuarterOptions={currentQuarterOptions}
                currentYear={currentYear}
                onCompareQuarterChange={setCompareQuarter}
                onCompareYearChange={setCompareYear}
                onCurrentQuarterChange={setCurrentQuarter}
                onCurrentYearChange={setCurrentYear}
                t={t}
                yearOptions={yearOptions}
            />

            {!snapshot.snapshotAvailable && (
                <SnapshotAvailabilityNotice
                    fallbackPeriod={data?.snapshot_info?.last_quarter ?? t('quarterly.last_quarter')}
                    missingPeriods={snapshot.missingSnapshotPeriods}
                    t={t}
                />
            )}

            {data && (
                <>
                    <div
                        aria-label={t('quarterly.observation_evidence')}
                        className="mb-4 break-words rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-xs text-slate-400"
                    >
                        <p>
                            <span className="font-bold text-slate-300">{data.snapshot_info?.current_quarter} · {sourceLabel(currentSource)}</span>
                            {' '}{data.period.this_start} – {data.period.this_end}
                        </p>
                        <p>
                            <span className="font-bold text-slate-300">{data.snapshot_info?.last_quarter} · {sourceLabel(compareSource)}</span>
                            {' '}{data.period.last_start} – {data.period.last_end}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {metrics.map((key) => {
                            return (
                                <QuarterMetricCard
                                    key={key}
                                    change={data.changes?.[key]}
                                    compareQuarter={data.snapshot_info?.last_quarter}
                                    compareSnapshotAvailable={snapshot.compareSnapshotAvailable}
                                    currentQuarter={data.snapshot_info?.current_quarter}
                                    currentSnapshotAvailable={snapshot.currentSnapshotAvailable}
                                    isSnapshotMetric={snapshot.snapshotMetrics.has(key)}
                                    keyName={key}
                                    label={metricLabels[key] ?? key}
                                    lastValue={data.last_quarter?.[key] ?? null}
                                    metricObservation={data.metric_observations?.[key]}
                                    missingCompareSnapshotMetric={snapshot.missingCompareSnapshotMetrics.has(key)}
                                    missingCurrentSnapshotMetric={snapshot.missingCurrentSnapshotMetrics.has(key)}
                                    t={t}
                                    thisValue={data.this_quarter?.[key] ?? null}
                                />
                            );
                        })}
                    </div>
                </>
            )}
        </motion.div>
    );
}
