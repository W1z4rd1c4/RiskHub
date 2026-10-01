import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { History, TrendingUp } from 'lucide-react';
import { HistoryTimeline, HistoryTrendChart, HistoryComparisonPanel } from '@/components/history';
import { Pagination } from '@/components/tables/Pagination';
import { TableErrorState } from '@/components/tables/tableError/TableErrorState';
import type { KRIHistoryEntry } from '@/types/kri';
import type { HistoryTimelineItem, HistoryTrendPoint } from '@/types/history';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { formatMetricNumberValue } from '@/i18n/formatters';
import { formatKriPeriodDate, KRI_HISTORY_PAGE_SIZE } from '@/lib/kriHistory';
import type { CollectionOutcome } from '@/pages/shared/collectionPageState';

// ─────────────────────────────────────────────────────────────────────────────
// Pure transformation helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string, locale: string): string {
    return formatKriPeriodDate(dateStr, locale);
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
        status: entry.breach_status === 'within' ? 'within' : entry.breach_status === 'below' ? 'below' : 'above',
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
    page: number;
    onPageChange: (page: number) => void;
    isLoadingHistory: boolean;
    lowerLimit: number;
    upperLimit: number;
    unit: string;
    onSelectEntry: (entry: KRIHistoryEntry) => void;
    canRequestCorrection: boolean;
    outcome: CollectionOutcome;
    accessDenied?: boolean;
    onRetry: () => void;
}

export function KRIDetailHistoryTab({
    history,
    historyTotal,
    page,
    onPageChange,
    isLoadingHistory,
    lowerLimit,
    upperLimit,
    unit,
    onSelectEntry,
    canRequestCorrection,
    outcome,
    accessDenied = false,
    onRetry,
}: KRIDetailHistoryTabProps) {
    const { t } = useTranslation(['kris', 'common']);
    const format = useFormat();
    const summaryRef = useRef<HTMLParagraphElement>(null);
    const shouldFocusSummary = useRef(false);
    useEffect(() => {
        if (!isLoadingHistory && shouldFocusSummary.current) {
            summaryRef.current?.focus();
            shouldFocusSummary.current = false;
        }
    }, [isLoadingHistory, outcome.kind]);
    const changePage = (next: number) => {
        shouldFocusSummary.current = true;
        onPageChange(next);
    };
    const hasLoadedPage = outcome.kind === 'content' || outcome.kind === 'empty' || outcome.kind === 'stale-with-error';
    const periodEnds = history.map(entry => entry.period_end).sort();
    const dateWindow = history.length ? {
        from: formatDate(periodEnds[0], format.locale),
        to: formatDate(periodEnds[periodEnds.length - 1], format.locale),
    } : null;
    const unavailablePageKey = accessDenied ? 'history_tab.denied_page' : 'history_tab.unavailable_page';
    const hasError = outcome.kind === 'fatal-error' || outcome.kind === 'stale-with-error';
    const isRetrying = hasError ? outcome.isRetrying : false;
    const errorMessage = outcome.kind === 'denied' && accessDenied
        ? t('common:permissions.history_denied')
        : outcome.kind === 'stale-with-error'
        ? t('common:detail_load.stale_description')
        : t('common:errors.load_failed');
    const historyChartData = useMemo(() => buildHistoryChartData(history, format.locale), [history, format.locale]);
    const timelineItems = useMemo(
        () => buildTimelineItems(
            history,
            format.locale,
            t('comparison.recorded_by', { ns: 'kris' }),
            t('comparison.system', { ns: 'kris' }),
            t('comparison.period_end', { ns: 'kris' }),
        ),
        [history, format.locale, t],
    );

    return (
        <div className="space-y-6" data-testid="kri-history-window" aria-busy={isLoadingHistory}>
            <Pagination
                mode="cursor"
                ariaLabel={t('history_tab.pagination')}
                previousLabel={t('history_tab.newer')}
                nextLabel={t('history_tab.older')}
                hasPrevious={page > 1}
                hasNext={hasLoadedPage && page * KRI_HISTORY_PAGE_SIZE < historyTotal}
                isLoading={isLoadingHistory}
                onPrevious={() => changePage(page - 1)}
                onNext={() => changePage(page + 1)}
                summary={(
                    <p ref={summaryRef} tabIndex={-1} role="status" className="text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                        {hasLoadedPage
                            ? t('history_tab.range', { from: history.length ? (page - 1) * KRI_HISTORY_PAGE_SIZE + 1 : 0, to: history.length ? (page - 1) * KRI_HISTORY_PAGE_SIZE + history.length : 0, total: historyTotal })
                            : t(isLoadingHistory ? 'history_tab.loading_page' : unavailablePageKey, { page })}
                    </p>
                )}
            />
            {hasError || outcome.kind === 'denied' ? (
                <TableErrorState
                    variant={outcome.kind === 'stale-with-error' ? 'banner' : 'block'}
                    testId="kri-history-load-state"
                    className="[&>p]:text-muted-foreground [&>span]:text-destructive [&>svg]:text-destructive"
                    message={errorMessage}
                    onRetry={hasError ? () => { shouldFocusSummary.current = true; onRetry(); } : undefined}
                    isRetrying={isRetrying}
                />
            ) : null}
            {hasLoadedPage && <>
                {/* Trend Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card"
                >
                    <h3 className="text-xs font-black text-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-accent-text" /> {t('history_tab.value_trend', { ns: 'kris' })}
                    </h3>
                    <p className="mb-4 text-sm text-muted-foreground">
                        {dateWindow ? t('history_tab.trend_window', dateWindow) : t('history_tab.no_window')}
                    </p>
                    <HistoryTrendChart
                        data={historyChartData}
                        lowerLimit={lowerLimit}
                        upperLimit={upperLimit}
                        valueLabel={unit || t('common:labels.value')}
                        formatValue={(val) => formatNumber(val, format.locale)}
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
                    <h3 className="text-xs font-black text-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                        <History className="h-4 w-4 text-accent-text" /> {t('history_tab.record_timeline', { ns: 'kris' })}
                        {historyTotal > 0 && <span className="text-muted-foreground font-normal">({t('history_tab.entries_count', { ns: 'kris', count: historyTotal })})</span>}
                    </h3>
                    <HistoryTimeline
                        items={timelineItems}
                        loading={isLoadingHistory}
                        emptyMessage={t('history_tab.empty_message', { ns: 'kris' })}
                        onItemAction={canRequestCorrection ? ((item) => {
                            const entry = history.find(h => h.id === item.id);
                            if (entry) onSelectEntry(entry);
                        }) : undefined}
                        actionLabel={canRequestCorrection ? t('history_edit.request_correction', { ns: 'kris' }) : undefined}
                    />
                </motion.div>

                {/* Compare Periods */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="glass-card"
                >
                    <h3 className="text-xs font-black text-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-accent-text" /> {t('history_tab.compare_periods', { ns: 'kris' })}
                    </h3>
                    <p className="mb-4 text-sm text-muted-foreground">{t('history_tab.comparison_window')}</p>
                    {history.length >= 2 ? (
                        <HistoryComparisonPanel
                            key={page}
                            entries={history}
                            formatValue={(val) => formatNumber(val, format.locale)}
                        />
                    ) : (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            {t('history_tab.need_two_entries_compare', { ns: 'kris' })}
                        </div>
                    )}
                </motion.div>
            </>}
        </div>
    );
}
