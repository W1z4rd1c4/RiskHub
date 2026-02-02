import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { History, TrendingUp } from 'lucide-react';
import { HistoryTimeline, HistoryTrendChart, HistoryComparisonPanel } from '@/components/history';
import type { KRIHistoryEntry } from '@/types/kri';
import type { HistoryTimelineItem, HistoryTrendPoint } from '@/types/history';

// ─────────────────────────────────────────────────────────────────────────────
// Pure transformation helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatNumber(val: number): string {
    if (val === 0) return '0';
    if (Math.abs(val) < 1) return val.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (Math.abs(val) < 100) return val.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    return Math.round(val).toLocaleString('cs-CZ');
}

function buildHistoryChartData(history: KRIHistoryEntry[]): HistoryTrendPoint[] {
    if (!history.length) return [];
    const sorted = [...history].sort((a, b) => new Date(a.period_end).getTime() - new Date(b.period_end).getTime());
    return sorted.map(entry => ({
        label: formatDate(entry.period_end),
        value: entry.value,
        status: entry.breach_status === 'within' ? 'within' : 'above',
    }));
}

function buildTimelineItems(history: KRIHistoryEntry[]): HistoryTimelineItem[] {
    if (!history.length) return [];
    const sorted = [...history].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
    return sorted.map(entry => ({
        id: entry.id,
        title: `${formatNumber(entry.value)} ${entry.unit}`,
        subtitle: `Period end ${formatDate(entry.period_end)}`,
        timestamp: entry.recorded_at,
        status: entry.breach_status === 'within' ? 'success' : 'danger',
        meta: [
            { label: 'Recorded by', value: entry.recorded_by_name ?? 'System' },
            { label: 'Period', value: `${formatDate(entry.period_start)} – ${formatDate(entry.period_end)}` },
        ],
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface KRIDetailHistoryTabProps {
    history: KRIHistoryEntry[];
    historyTotal: number;
    isLoadingHistory: boolean;
    lowerLimit: number;
    upperLimit: number;
    unit: string;
    onSelectEntry: (entry: KRIHistoryEntry) => void;
}

export function KRIDetailHistoryTab({
    history,
    historyTotal,
    isLoadingHistory,
    lowerLimit,
    upperLimit,
    unit,
    onSelectEntry,
}: KRIDetailHistoryTabProps) {
    const historyChartData = useMemo(() => buildHistoryChartData(history), [history]);
    const timelineItems = useMemo(() => buildTimelineItems(history), [history]);

    return (
        <div className="space-y-6">
            {/* Trend Chart */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card"
            >
                <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-accent" /> Value Trend
                </h3>
                <HistoryTrendChart
                    data={historyChartData}
                    lowerLimit={lowerLimit}
                    upperLimit={upperLimit}
                    valueLabel={unit || 'Value'}
                    formatValue={formatNumber}
                    emptyMessage="No history recorded yet. Click 'Record Value' to start tracking."
                />
            </motion.div>

            {/* Timeline */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card"
            >
                <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <History className="h-4 w-4 text-accent" /> Record Timeline
                    {historyTotal > 0 && <span className="text-slate-500 font-normal">({historyTotal} entries)</span>}
                </h3>
                <HistoryTimeline
                    items={timelineItems}
                    loading={isLoadingHistory}
                    emptyMessage="No history recorded yet. Click 'Record Value' to start tracking."
                    onItemAction={(item) => {
                        const entry = history.find(h => h.id === item.id);
                        if (entry) onSelectEntry(entry);
                    }}
                    actionLabel="Request Correction"
                />
            </motion.div>

            {/* Compare Periods */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card"
            >
                <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-accent" /> Compare Periods
                </h3>
                {history.length >= 2 ? (
                    <HistoryComparisonPanel
                        entries={history}
                        formatValue={formatNumber}
                    />
                ) : (
                    <div className="text-center py-8 text-slate-500 text-sm">
                        Need at least 2 history entries to compare periods.
                    </div>
                )}
            </motion.div>
        </div>
    );
}
