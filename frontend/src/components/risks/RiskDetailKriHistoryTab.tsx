import { motion } from 'framer-motion';
import { History } from 'lucide-react';
import type { HistoryTimelineItem } from '@/types/history';
import { HistoryTimeline } from '@/components/history';

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
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card"
        >
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                <History className="h-4 w-4 text-accent" />
                Aggregated KRI History
                {items.length > 0 && (
                    <span className="text-slate-500 font-normal">({items.length} entries)</span>
                )}
            </h3>

            <HistoryTimeline
                items={items}
                loading={loading}
                emptyMessage={
                    hasKRIs
                        ? 'No KRI values have been recorded yet.'
                        : 'This risk has no KRIs configured. Add KRIs from the Overview tab to start tracking history.'
                }
            />
        </motion.div>
    );
}
