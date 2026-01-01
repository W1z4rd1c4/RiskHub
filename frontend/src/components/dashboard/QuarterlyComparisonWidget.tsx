import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import { dashboardApi } from '@/services/dashboardApi';

interface QuarterlyData {
    this_quarter: Record<string, number>;
    last_quarter: Record<string, number>;
    changes: Record<string, { absolute: number; percentage: number; direction: string }>;
    period: { this_start: string; this_end: string; last_start: string; last_end: string };
}

const METRIC_LABELS: Record<string, string> = {
    new_risks: 'New Risks',
    closed_risks: 'Closed Risks',
    active_risks: 'Active Risks',
    priority_risks: 'Priority Risks',
    kri_breaches: 'KRI Breaches',
    pending_approvals: 'Pending Approvals',
};

const METRIC_COLORS: Record<string, { positive: string; negative: string }> = {
    new_risks: { positive: 'text-rose-400', negative: 'text-emerald-400' }, // More new risks = concerning
    closed_risks: { positive: 'text-emerald-400', negative: 'text-rose-400' }, // More closed = good
    active_risks: { positive: 'text-rose-400', negative: 'text-emerald-400' }, // More active = concerning
    priority_risks: { positive: 'text-rose-400', negative: 'text-emerald-400' }, // More priority = concerning
    kri_breaches: { positive: 'text-rose-400', negative: 'text-emerald-400' }, // More breaches = concerning
    pending_approvals: { positive: 'text-amber-400', negative: 'text-emerald-400' }, // More pending = attention needed
};

function getChangeColor(key: string, direction: string): string {
    const colors = METRIC_COLORS[key] || { positive: 'text-slate-400', negative: 'text-slate-400' };
    if (direction === 'same') return 'text-slate-400';
    return direction === 'up' ? colors.positive : colors.negative;
}

function formatQuarter(dateStr: string): string {
    const date = new Date(dateStr);
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `Q${quarter} ${date.getFullYear()}`;
}

export function QuarterlyComparisonWidget() {
    const [data, setData] = useState<QuarterlyData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
                    <h3 className="text-lg font-bold text-white">Quarterly Comparison</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
                    <h3 className="text-lg font-bold text-white">Quarterly Comparison</h3>
                </div>
                <p className="text-slate-500 text-sm">{error || 'No data available'}</p>
            </div>
        );
    }

    const metrics = Object.keys(METRIC_LABELS);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card"
        >
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-bold text-white">Quarterly Comparison</h3>
                </div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    {formatQuarter(data.period.this_start)} vs {formatQuarter(data.period.last_start)}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {metrics.map((key) => {
                    const thisVal = data.this_quarter[key];
                    const lastVal = data.last_quarter[key];
                    const change = data.changes[key];
                    const colorClass = getChangeColor(key, change.direction);

                    return (
                        <motion.div
                            key={key}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-white/5 rounded-xl p-4 border border-white/5"
                        >
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                                {METRIC_LABELS[key]}
                            </p>
                            <div className="flex items-end gap-2 mb-1">
                                <span className="text-2xl font-black text-white">{thisVal}</span>
                                <span className="text-xs text-slate-600 pb-1">vs {lastVal}</span>
                            </div>
                            <div className={`flex items-center gap-1 text-xs font-bold ${colorClass}`}>
                                {change.direction === 'up' && <TrendingUp className="h-3 w-3" />}
                                {change.direction === 'down' && <TrendingDown className="h-3 w-3" />}
                                {change.direction === 'same' && <Minus className="h-3 w-3" />}
                                <span>
                                    {change.absolute > 0 ? '+' : ''}{change.absolute} ({change.percentage}%)
                                </span>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </motion.div>
    );
}
