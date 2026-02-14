import { motion } from 'framer-motion';
import { History } from 'lucide-react';
import type { HistoryTimelineItem } from '@/types/history';
import { HistoryTimeline } from '@/components/history';
import { useTranslation } from '@/i18n/hooks';

interface RiskDetailKriHistoryTabProps {
    items: HistoryTimelineItem[];
    loading: boolean;
    hasKRIs: boolean;
}

export function RiskDetailKriHistoryTab({
    items,
    loading,
    hasKRIs,
}: RiskDetailKriHistoryTabProps) {
    const { t } = useTranslation(['risks', 'kris']);
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

            <HistoryTimeline
                items={items}
                loading={loading}
                emptyMessage={
                    hasKRIs
                        ? t('history_tab.no_kri_values', { ns: 'risks' })
                        : t('history_tab.no_kris_configured', { ns: 'risks' })
                }
            />
        </motion.div>
    );
}
