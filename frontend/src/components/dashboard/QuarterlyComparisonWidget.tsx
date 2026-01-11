import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Calendar, AlertTriangle, HelpCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dashboardApi } from '@/services/dashboardApi';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

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

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

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

/** Parse quarter label like '2026-Q1' into { year, quarter } */
function parseQuarterLabel(label: string): { year: number; quarter: number } {
    const match = label.match(/^(\d{4})-Q([1-4])$/);
    if (!match) {
        const now = new Date();
        return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
    }
    return { year: parseInt(match[1]), quarter: parseInt(match[2]) };
}

/** Format year and quarter number into API format '2026-Q1' */
function toQuarterLabel(year: number, quarter: number): string {
    return `${year}-Q${quarter}`;
}

/** Get previous quarter from a given quarter */
function getPreviousQuarter(year: number, quarter: number): { year: number; quarter: number } {
    if (quarter === 1) {
        return { year: year - 1, quarter: 4 };
    }
    return { year, quarter: quarter - 1 };
}

export function QuarterlyComparisonWidget() {
    const { t } = useTranslation('dashboard');
    const [data, setData] = useState<QuarterlyData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Available periods from backend
    const [availableYears, setAvailableYears] = useState<number[]>([]);

    // Selected periods - null means "use default"
    const [currentYear, setCurrentYear] = useState<number | null>(null);
    const [currentQ, setCurrentQ] = useState<number | null>(null);
    const [compareYear, setCompareYear] = useState<number | null>(null);
    const [compareQ, setCompareQ] = useState<number | null>(null);

    // Metric labels with translations
    const metricLabels: Record<string, string> = useMemo(() => ({
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
    }), [t]);

    // Build quarter label for API, or undefined if using defaults
    const currentQuarterLabel = currentYear && currentQ ? toQuarterLabel(currentYear, currentQ) : undefined;
    const compareQuarterLabel = compareYear && compareQ ? toQuarterLabel(compareYear, compareQ) : undefined;

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await dashboardApi.fetchQuarterlyComparison(currentQuarterLabel, compareQuarterLabel);
            setData(result);
        } catch (err) {
            console.error('Failed to fetch quarterly comparison:', err);
            setError('Failed to load quarterly data');
        } finally {
            setIsLoading(false);
        }
    }, [currentQuarterLabel, compareQuarterLabel]);

    // Load available periods and initial data
    useEffect(() => {
        async function init() {
            try {
                const periods = await dashboardApi.fetchAvailablePeriods();
                setAvailableYears(periods.years);

                // Parse current quarter from response and set defaults
                const { year, quarter } = parseQuarterLabel(periods.current_quarter);
                setCurrentYear(year);
                setCurrentQ(quarter);

                // Set compare to previous quarter
                const prev = getPreviousQuarter(year, quarter);
                setCompareYear(prev.year);
                setCompareQ(prev.quarter);
            } catch (err) {
                console.error('Failed to fetch available periods:', err);
                // Fall back to current date
                const now = new Date();
                const year = now.getFullYear();
                const quarter = Math.floor(now.getMonth() / 3) + 1;
                setAvailableYears([year]);
                setCurrentYear(year);
                setCurrentQ(quarter);
                const prev = getPreviousQuarter(year, quarter);
                setCompareYear(prev.year);
                setCompareQ(prev.quarter);
            }
        }
        init();
    }, []);

    // Fetch data when periods change
    useEffect(() => {
        if (currentYear && currentQ && compareYear && compareQ) {
            fetchData();
        }
    }, [currentYear, currentQ, compareYear, compareQ, fetchData]);

    // Year options for select
    const yearOptions = useMemo(() =>
        availableYears.map(y => ({ value: y.toString(), label: y.toString() })),
        [availableYears]);

    // Quarter options
    const quarterOptions = QUARTERS.map((q, i) => ({ value: (i + 1).toString(), label: q }));

    if (isLoading && !data) {
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

    if (error && !data) {
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
    const snapshotAvailable = data?.snapshot_info?.last_quarter_snapshot_available ?? true;
    const snapshotMetrics = new Set(data?.snapshot_info?.snapshot_metrics ?? []);

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
                    <h3 className="text-lg font-bold text-white">{t('sections.quarterly_comparison', 'Quarterly Comparison')}</h3>
                </div>
                {isLoading && (
                    <RefreshCw className="h-4 w-4 text-slate-400 animate-spin" />
                )}
            </div>

            {/* Period Selector */}
            <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-white/5">
                {/* Current Period */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {t('quarterly.current_period', 'Current:')}
                    </span>
                    <ThemedSelect
                        value={currentQ?.toString() ?? '1'}
                        onValueChange={(v) => setCurrentQ(parseInt(v))}
                        options={quarterOptions}
                        className="min-w-[70px]"
                    />
                    <ThemedSelect
                        value={currentYear?.toString() ?? ''}
                        onValueChange={(v) => setCurrentYear(parseInt(v))}
                        options={yearOptions}
                        className="min-w-[90px]"
                    />
                </div>

                <span className="text-xs text-slate-600 font-bold">vs</span>

                {/* Compare Period */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {t('quarterly.compare_period', 'Compare:')}
                    </span>
                    <ThemedSelect
                        value={compareQ?.toString() ?? '4'}
                        onValueChange={(v) => setCompareQ(parseInt(v))}
                        options={quarterOptions}
                        className="min-w-[70px]"
                    />
                    <ThemedSelect
                        value={compareYear?.toString() ?? ''}
                        onValueChange={(v) => setCompareYear(parseInt(v))}
                        options={yearOptions}
                        className="min-w-[90px]"
                    />
                </div>
            </div>

            {/* Warning banner when historical snapshot is missing */}
            {!snapshotAvailable && (
                <div className="mb-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
                    <span className="text-xs text-amber-300">
                        No historical snapshot for {data?.snapshot_info?.last_quarter ?? 'last quarter'}.
                        Snapshot-based metrics show current values only.
                    </span>
                </div>
            )}

            {/* Metrics Grid */}
            {data && (
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
            )}
        </motion.div>
    );
}
