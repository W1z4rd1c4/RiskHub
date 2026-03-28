import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { History, TrendingUp } from 'lucide-react';
import { HistoryTimeline, HistoryTrendChart, HistoryComparisonPanel } from '@/components/history';
import type { KRIHistoryEntry } from '@/types/kri';
import type { HistoryTimelineItem, HistoryTrendPoint } from '@/types/history';
import { useTranslation } from '@/i18n/hooks';
import { formatDateValue, formatMetricNumberValue } from '@/i18n/formatters';

// ─────────────────────────────────────────────────────────────────────────────
// Pure transformation helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string, locale: string): string {
    return formatDateValue(dateStr, locale);
}

function formatNumber(val: number, locale: string): string {
    return formatMetricNumberValue(val, locale);
}

function buildHistoryChartData(history: KRIHistoryEntry[], locale: string): HistoryTrendPoint[] {
    if (!history.length) return [];
    const sorted = [...history].sort((a, b) => new Date(a.period_end).getTime() - new Date(b.period_end).getTime());
    return sorted.map(entry => ({
        label: formatDate(entry.period_end, locale),
        value: entry.value,
        status: entry.breach_status === 'within' ? 'within' : 'above',
    }));
}

function buildTimelineItems(history: KRIHistoryEntry[], locale: string, recordedByLabel: string, systemLabel: string, periodLabel: string): HistoryTimelineItem[] {
    if (!history.length) return [];
    const sorted = [...history].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
    return sorted.map(entry => ({
        id: entry.id,
        title: `${formatNumber(entry.value, locale)} ${entry.unit}`,
        subtitle: `${periodLabel} ${formatDate(entry.period_end, locale)}`,
        timestamp: entry.recorded_at,
        status: entry.breach_status === 'within' ? 'success' : 'danger',
        meta: [
            { label: recordedByLabel, value: entry.recorded_by_name ?? systemLabel },
            { label: periodLabel, value: `${formatDate(entry.period_start, locale)} – ${formatDate(entry.period_end, locale)}` },
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
    const { t, i18n } = useTranslation(['kris', 'common']);
    const historyChartData = useMemo(() => buildHistoryChartData(history, i18n.language), [history, i18n.language]);
    const timelineItems = useMemo(
        () => buildTimelineItems(
            history,
            i18n.language,
            t('comparison.recorded_by', { ns: 'kris' }),
            t('comparison.system', { ns: 'kris' }),
            t('comparison.period_end', { ns: 'kris' }),
        ),
        [history, i18n.language, t],
    );

    return (
        <div className="space-y-6">
            {/* Trend Chart */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card"
            >
                <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-accent" /> {t('history_tab.value_trend', { ns: 'kris' })}
                </h3>
                <HistoryTrendChart
                    data={historyChartData}
                    lowerLimit={lowerLimit}
                    upperLimit={upperLimit}
                    valueLabel={unit || t('common:labels.value')}
                    formatValue={(val) => formatNumber(val, i18n.language)}
                    emptyMessage={t('history_tab.empty_message', { ns: 'kris' })}
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
                    <History className="h-4 w-4 text-accent" /> {t('history_tab.record_timeline', { ns: 'kris' })}
                    {historyTotal > 0 && <span className="text-slate-500 font-normal">({t('history_tab.entries_count', { ns: 'kris', count: historyTotal })})</span>}
                </h3>
                <HistoryTimeline
                    items={timelineItems}
                    loading={isLoadingHistory}
                    emptyMessage={t('history_tab.empty_message', { ns: 'kris' })}
                    onItemAction={(item) => {
                        const entry = history.find(h => h.id === item.id);
                        if (entry) onSelectEntry(entry);
                    }}
                    actionLabel={t('history_edit.request_correction', { ns: 'kris' })}
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
                    <TrendingUp className="h-4 w-4 text-accent" /> {t('history_tab.compare_periods', { ns: 'kris' })}
                </h3>
                {history.length >= 2 ? (
                    <HistoryComparisonPanel
                        entries={history}
                        formatValue={(val) => formatNumber(val, i18n.language)}
                    />
                ) : (
                    <div className="text-center py-8 text-slate-500 text-sm">
                        {t('history_tab.need_two_entries_compare', { ns: 'kris' })}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
