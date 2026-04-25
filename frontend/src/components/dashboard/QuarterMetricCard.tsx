import { motion } from 'framer-motion';
import { HelpCircle, Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { getChangeColor, type MetricChange } from './quarterlyComparisonPresentation';

interface QuarterMetricCardProps {
    change?: MetricChange;
    compareSnapshotAvailable: boolean;
    currentSnapshotAvailable: boolean;
    isSnapshotMetric: boolean;
    keyName: string;
    label: string;
    lastValue: number | null;
    missingCompareSnapshotMetric: boolean;
    missingCurrentSnapshotMetric: boolean;
    t: (key: string) => string;
    thisValue: number | null;
}

export function QuarterMetricCard({
    change,
    compareSnapshotAvailable,
    currentSnapshotAvailable,
    isSnapshotMetric,
    keyName,
    label,
    lastValue,
    missingCompareSnapshotMetric,
    missingCurrentSnapshotMetric,
    t,
    thisValue,
}: QuarterMetricCardProps) {
    const direction = change?.direction ?? 'same';

    if (thisValue === null && lastValue === null && direction !== 'unknown') {
        return null;
    }

    const absolute = change?.absolute ?? 0;
    const percentage = change?.percentage ?? 0;
    const colorClass = getChangeColor(keyName, direction);
    const showCurrentUncertainty = isSnapshotMetric && (
        !currentSnapshotAvailable || missingCurrentSnapshotMetric
    );
    const showCompareUncertainty = isSnapshotMetric && (
        !compareSnapshotAvailable || missingCompareSnapshotMetric
    );
    const showUncertainty = showCurrentUncertainty || showCompareUncertainty;
    const displayThisValue = showCurrentUncertainty ? '—' : (thisValue ?? '—');
    const displayLastValue = showCompareUncertainty ? '—' : (lastValue ?? '—');

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`bg-white/5 rounded-xl p-4 border ${showUncertainty ? 'border-amber-500/20' : 'border-white/5'}`}
        >
            <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {label || keyName}
                </p>
                {showUncertainty && (
                    <span title={t('quarterly.no_snapshot_hint')}>
                        <HelpCircle className="h-3 w-3 text-amber-400" />
                    </span>
                )}
            </div>
            <div className="flex items-end gap-2 mb-1">
                <span className="text-2xl font-black text-white">{displayThisValue}</span>
                <span className="text-xs text-slate-600 pb-1">vs {displayLastValue}</span>
            </div>
            <div className={`flex items-center gap-1 text-xs font-bold ${colorClass}`}>
                {direction === 'up' && <TrendingUp className="h-3 w-3" />}
                {direction === 'down' && <TrendingDown className="h-3 w-3" />}
                {direction === 'same' && <Minus className="h-3 w-3" />}
                {direction === 'unknown' && <HelpCircle className="h-3 w-3" />}
                <span>
                    {direction === 'unknown'
                        ? t('quarterly.not_available')
                        : `${absolute > 0 ? '+' : ''}${absolute} (${percentage}%)`}
                </span>
            </div>
        </motion.div>
    );
}
