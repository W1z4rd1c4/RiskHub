import { motion } from 'framer-motion';
import { History } from 'lucide-react';
import type { HistoryTimelineItem } from '@/types/history';
import { HistoryTimeline } from '@/components/history';
import { TableErrorState } from '@/components/tables/tableError/TableErrorState';
import { useTranslation } from '@/i18n/hooks';
import type { CollectionOutcome } from '@/pages/shared/collectionPageState';

interface RiskDetailKriHistoryTabProps {
    items: HistoryTimelineItem[];
    hasKRIs: boolean;
    outcome: CollectionOutcome;
    onRetry: () => void;
}

export function RiskDetailKriHistoryTab({
    items,
    hasKRIs,
    outcome,
    onRetry,
}: RiskDetailKriHistoryTabProps) {
    const { t } = useTranslation(['risks', 'kris']);
    const hasError = outcome.kind === 'fatal-error' || outcome.kind === 'stale-with-error';
    const isRetrying = hasError ? outcome.isRetrying : false;
    const isLoading = outcome.kind === 'initial-loading';
    const errorMessage = outcome.kind === 'stale-with-error'
        ? t('common:detail_load.stale_description')
        : t('common:errors.load_failed');
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card"
        >
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                <History className="h-4 w-4 text-accent" />
                {t('history_tab.aggregated_kri_history', { ns: 'risks' })}
                {items.length > 0 && <span className="text-slate-500 font-normal">({t('history_tab.entries_count', { ns: 'kris', count: items.length })})</span>}
            </h3>

            {outcome.kind === 'fatal-error' || outcome.kind === 'denied' ? (
                <TableErrorState
                    testId="risk-kri-history-load-state"
                    message={errorMessage}
                    onRetry={outcome.kind === 'fatal-error' ? onRetry : undefined}
                    isRetrying={isRetrying}
                />
            ) : (
                <>
                    {outcome.kind === 'stale-with-error' ? (
                        <TableErrorState
                            variant="banner"
                            testId="risk-kri-history-load-state"
                            message={errorMessage}
                            onRetry={onRetry}
                            isRetrying={isRetrying}
                            className="mb-4"
                        />
                    ) : null}
                    <HistoryTimeline
                        items={items}
                        loading={isLoading}
                        emptyMessage={
                            hasKRIs
                                ? t('history_tab.no_kri_values', { ns: 'risks' })
                                : t('history_tab.no_kris_configured', { ns: 'risks' })
                        }
                    />
                </>
            )}
        </motion.div>
    );
}
