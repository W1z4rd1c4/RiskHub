import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Calendar, AlertTriangle, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dashboardApi } from '@/services/dashboardApi';

interface MetricChange {
    absolute: number;
    percentage: number;
    direction: 'up' | 'down' | 'same' | 'unknown';
    note?: string;
}

interface SnapshotInfo {
    current_quarter: string;
    last_quarter: string;
    last_quarter_snapshot_available: boolean;
    period_metrics: string[];
    snapshot_metrics: string[];
}

interface QuarterlyData {
    this_quarter: Record<string, number>;
    last_quarter: Record<string, number>;
    changes: Record<string, MetricChange>;
    period: { this_start: string; this_end: string; last_start: string; last_end: string };
    snapshot_info?: SnapshotInfo;
}



const METRIC_COLORS: Record<string, { positive: string; negative: string }> = {
    // Row 1: Risk Posture
    new_risks: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    closed_risks: { positive: 'text-emerald-400', negative: 'text-rose-400' },
    active_risks: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    priority_risks: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    kri_breaches: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    pending_approvals: { positive: 'text-amber-400', negative: 'text-emerald-400' },
    // Row 2: Audit & Control Effectiveness
    audit_activity: { positive: 'text-emerald-400', negative: 'text-rose-400' },
    failed_audits: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    control_coverage: { positive: 'text-emerald-400', negative: 'text-rose-400' },
    unaudited_controls: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    // Row 3: Governance Health
    orphaned_items: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    kri_health: { positive: 'text-emerald-400', negative: 'text-rose-400' },
    overdue_kris: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    activity_volume: { positive: 'text-slate-400', negative: 'text-slate-400' },
    risks_without_kri: { positive: 'text-rose-400', negative: 'text-emerald-400' },
};

function getChangeColor(key: string, direction: string): string {
    const colors = METRIC_COLORS[key] || { positive: 'text-slate-400', negative: 'text-slate-400' };
    if (direction === 'same' || direction === 'unknown') return 'text-slate-400';
    return direction === 'up' ? colors.positive : colors.negative;
}

function formatQuarter(dateStr: string): string {
    const date = new Date(dateStr);
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `Q${quarter} ${date.getFullYear()}`;
}

export function QuarterlyComparisonWidget() {
    const { t } = useTranslation('dashboard');
    const [data, setData] = useState<QuarterlyData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Metric labels with translations
    const metricLabels: Record<string, string> = {
        new_risks: t('quarterly.new_risks', 'New Risks'),
        closed_risks: t('quarterly.closed_risks', 'Closed Risks'),
        active_risks: t('quarterly.active_risks', 'Active Risks'),
        priority_risks: t('quarterly.priority_risks', 'Priority Risks'),
        kri_breaches: t('quarterly.kri_breaches', 'KRI Breaches'),
        pending_approvals: t('quarterly.pending_approvals', 'Pending Approvals'),
        audit_activity: t('quarterly.audit_activity', 'Audit Activity'),
        failed_audits: t('quarterly.failed_audits', 'Failed Audits'),
        control_coverage: t('quarterly.control_coverage', 'Control Coverage %'),
        unaudited_controls: t('quarterly.unaudited_controls', 'Unaudited Controls'),
        orphaned_items: t('quarterly.orphaned_items', 'Orphaned Items'),
        kri_health: t('quarterly.kri_health', 'KRI Health %'),
        overdue_kris: t('quarterly.overdue_kris', 'Overdue KRIs'),
        activity_volume: t('quarterly.activity_volume', 'Activity Volume'),
        risks_without_kri: t('quarterly.risks_without_kri', 'Risks Without KRI'),
    };

    useEffect(() => {
        dashboardApi.fetchQuarterlyComparison()
            .then(setData)
            .catch((err) => {
                console.error('Failed to fetch quarterly comparison:', err);
                setError('Failed to load quarterly data');
            })
            .finally(() => setIsLoading(false));
    }, []);

    if (isLoading) {
        return (
            <div className="glass-card">
                <div className="flex items-center gap-2 mb-6">
                    <Calendar className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-bold text-white">{t('sections.quarterly_comparison', 'Quarterly Comparison')}</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {Array(6).fill(0).map((_, i) => (
                        <div key={i} className="animate-pulse bg-white/5 rounded-xl h-24" />
                    ))}
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="glass-card">
                <div className="flex items-center gap-2 mb-6">
                    <Calendar className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-bold text-white">{t('sections.quarterly_comparison', 'Quarterly Comparison')}</h3>
                </div>
                <p className="text-slate-500 text-sm">{error || 'No data available'}</p>
            </div>
        );
    }

    const metrics = Object.keys(metricLabels);
    const snapshotAvailable = data.snapshot_info?.last_quarter_snapshot_available ?? true;
    const snapshotMetrics = new Set(data.snapshot_info?.snapshot_metrics ?? []);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card"
        >
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-bold text-white">{t('sections.quarterly_comparison', 'Quarterly Comparison')}</h3>
                </div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    {formatQuarter(data.period.this_start)} vs {formatQuarter(data.period.last_start)}
                </div>
            </div>

            {/* Warning banner when historical snapshot is missing */}
            {!snapshotAvailable && (
                <div className="mb-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
                    <span className="text-xs text-amber-300">
                        No historical snapshot for {data.snapshot_info?.last_quarter ?? 'last quarter'}.
                        Snapshot-based metrics show current values only.
                    </span>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {metrics.map((key) => {
                    // Defensive: handle missing metrics gracefully
                    const thisVal = data.this_quarter?.[key] ?? null;
                    const lastVal = data.last_quarter?.[key] ?? null;
                    const change = data.changes?.[key];

                    // Skip rendering if metric is completely missing
                    if (thisVal === null && lastVal === null) {
                        return null;
                    }

                    // Handle missing change data
                    const direction = change?.direction ?? 'same';
                    const absolute = change?.absolute ?? 0;
                    const percentage = change?.percentage ?? 0;
                    const isSnapshotMetric = snapshotMetrics.has(key);

                    const colorClass = getChangeColor(key, direction);
                    const showUncertainty = isSnapshotMetric && !snapshotAvailable;

                    return (
                        <motion.div
                            key={key}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`bg-white/5 rounded-xl p-4 border ${showUncertainty ? 'border-amber-500/20' : 'border-white/5'}`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    {metricLabels[key] || key}
                                </p>
                                {showUncertainty && (
                                    <span title="No historical snapshot - comparison unavailable">
                                        <HelpCircle className="h-3 w-3 text-amber-400" />
                                    </span>
                                )}
                            </div>
                            <div className="flex items-end gap-2 mb-1">
                                <span className="text-2xl font-black text-white">{thisVal ?? '—'}</span>
                                <span className="text-xs text-slate-600 pb-1">vs {lastVal ?? '—'}</span>
                            </div>
                            <div className={`flex items-center gap-1 text-xs font-bold ${colorClass}`}>
                                {direction === 'up' && <TrendingUp className="h-3 w-3" />}
                                {direction === 'down' && <TrendingDown className="h-3 w-3" />}
                                {direction === 'same' && <Minus className="h-3 w-3" />}
                                {direction === 'unknown' && <HelpCircle className="h-3 w-3" />}
                                <span>
                                    {direction === 'unknown'
                                        ? 'N/A'
                                        : `${absolute > 0 ? '+' : ''}${absolute} (${percentage}%)`
                                    }
                                </span>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </motion.div>
    );
}

