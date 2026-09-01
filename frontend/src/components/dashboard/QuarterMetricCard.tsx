import { motion } from 'framer-motion';
import { HelpCircle, Minus, TrendingDown, TrendingUp } from 'lucide-react';

import type { DashboardMetricObservation } from '@/services/dashboardApi';

import { getChangeColor, type MetricChange } from './quarterlyComparisonPresentation';

interface QuarterMetricCardProps {
    change?: MetricChange;
    compareQuarter?: string;
    compareSnapshotAvailable: boolean;
    currentQuarter?: string;
    currentSnapshotAvailable: boolean;
    isSnapshotMetric: boolean;
    keyName: string;
    label: string;
    lastValue: number | null;
    metricObservation?: DashboardMetricObservation;
    missingCompareSnapshotMetric: boolean;
    missingCurrentSnapshotMetric: boolean;
    t: (key: string, options?: Record<string, unknown>) => string;
    thisValue: number | null;
}

function getChangeLabel(
    change: MetricChange | undefined,
    t: QuarterMetricCardProps['t'],
): string {
    const absolute = change?.absolute;
    const percentage = change?.percentage;
    if (change?.reason === 'baseline_zero' && absolute !== null && absolute !== undefined) {
        return t('quarterly.new_from_zero', { change: absolute, ns: 'dashboard' });
    }
    if (
        change?.direction === 'unknown'
        || absolute === null
        || absolute === undefined
        || percentage === null
        || percentage === undefined
    ) {
        return t('quarterly.not_available');
    }
    return `${absolute > 0 ? '+' : ''}${absolute} (${percentage}%)`;
}

export function QuarterMetricCard({
    change,
    compareQuarter,
    compareSnapshotAvailable,
    currentQuarter,
    currentSnapshotAvailable,
    isSnapshotMetric,
    keyName,
    label,
    lastValue,
    metricObservation,
    missingCompareSnapshotMetric,
    missingCurrentSnapshotMetric,
    t,
    thisValue,
}: QuarterMetricCardProps) {
    const direction = change?.direction ?? 'same';

    if (thisValue === null && lastValue === null && direction !== 'unknown') {
        return null;
    }

    const colorClass = getChangeColor(keyName, direction);
    const showCurrentUncertainty = isSnapshotMetric && (
        !currentSnapshotAvailable || missingCurrentSnapshotMetric
    );
    const showCompareUncertainty = isSnapshotMetric && (
        !compareSnapshotAvailable || missingCompareSnapshotMetric
    );
    const unavailableReason = change?.reason === 'baseline_zero' ? undefined : change?.reason;
    const showUncertainty = showCurrentUncertainty || showCompareUncertainty || Boolean(unavailableReason);
    const uncertaintyHint = unavailableReason
        ? t(
            unavailableReason === 'missing_definition'
                ? 'quarterly.missing_definition'
                : 'quarterly.comparison_unavailable',
            { ns: 'dashboard' },
        )
        : t('quarterly.no_snapshot_hint', { ns: 'dashboard' });
    const displayThisValue = showCurrentUncertainty ? '—' : (thisValue ?? '—');
    const displayLastValue = showCompareUncertainty ? '—' : (lastValue ?? '—');
    const stockObservation = metricObservation?.metric_type === 'stock'
        ? metricObservation
        : null;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            aria-label={label || keyName}
            className={`bg-white/5 rounded-xl p-4 border ${showUncertainty ? 'border-amber-500/20' : 'border-white/5'}`}
            role="group"
        >
            <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {label || keyName}
                </p>
                {showUncertainty && (
                    <span title={uncertaintyHint}>
                        <HelpCircle className="h-3 w-3 text-amber-400" />
                    </span>
                )}
            </div>
            <div className="flex items-end gap-2 mb-1">
                <span className="text-2xl font-black text-white">{displayThisValue}</span>
                <span className="text-xs text-slate-400 pb-1">vs {displayLastValue}</span>
            </div>
            <div className={`flex items-center gap-1 text-xs font-bold ${colorClass}`}>
                {direction === 'up' && <TrendingUp className="h-3 w-3" />}
                {direction === 'down' && <TrendingDown className="h-3 w-3" />}
                {direction === 'same' && <Minus className="h-3 w-3" />}
                {direction === 'unknown' && <HelpCircle className="h-3 w-3" />}
                <span>{getChangeLabel(change, t)}</span>
            </div>
            {stockObservation && currentQuarter && compareQuarter ? (
                <div
                    aria-label={t('quarterly.stock_observations', { ns: 'dashboard' })}
                    className="mt-3 break-words border-t border-white/5 pt-2 text-[10px] leading-4 text-slate-400"
                >
                    <p>
                        {currentQuarter} · {t(`quarterly.source.${stockObservation.current.source}`)}{' '}
                        {stockObservation.current.observed_at ?? t('quarterly.not_available')}
                    </p>
                    <p>
                        {compareQuarter} · {t(`quarterly.source.${stockObservation.compare.source}`)}{' '}
                        {stockObservation.compare.observed_at ?? t('quarterly.not_available')}
                    </p>
                </div>
            ) : null}
        </motion.div>
    );
}
