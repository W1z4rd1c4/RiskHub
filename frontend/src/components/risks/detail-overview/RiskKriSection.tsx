import { motion } from 'framer-motion';
import { FileText, Plus } from 'lucide-react';

import { KRIGaugeCard } from '@/components/kri/KRIGaugeCard';
import { useTranslation } from '@/i18n/hooks';
import type { OverdueKRI } from '@/types/kri';
import type { Risk } from '@/types/risk';

interface RiskKriSectionProps {
    risk: Risk;
    overdueKRIs: OverdueKRI[];
    canCreateKri: boolean;
    onNavigateToNewKri: () => void;
    onNavigateToKri: (kriId: number) => void;
}

export function RiskKriSection({
    risk,
    overdueKRIs,
    canCreateKri,
    onNavigateToNewKri,
    onNavigateToKri,
}: RiskKriSectionProps) {
    const { t } = useTranslation(['risks', 'common']);

    return (
        <motion.div variants={item} className="glass-card flex flex-col gap-6 md:col-span-2 lg:col-span-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-amber-400" />
                    <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('overview.risk_appetite_indicators', { ns: 'risks' })}</h3>
                </div>
                {canCreateKri && (
                    <button
                        onClick={onNavigateToNewKri}
                        className="px-3 py-1 bg-accent/10 border border-accent/20 rounded-lg text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/20 transition-all font-bold"
                    >
                        <Plus className="h-3 w-3 inline mr-1" /> {t('overview.add_kri', { ns: 'risks' })}
                    </button>
                )}
            </div>

            {risk.kris && risk.kris.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {risk.kris.map((kri) => {
                        const overdueInfo = overdueKRIs.find((overdue) => overdue.kri_id === kri.id);
                        return (
                            <KRIGaugeCard
                                key={kri.id}
                                kri={kri}
                                isOverdue={Boolean(overdueInfo)}
                                daysOverdue={overdueInfo?.days_overdue}
                                onClick={() => onNavigateToKri(kri.id)}
                            />
                        );
                    })}
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-white/5 rounded-2xl">
                    <p className="text-slate-600 text-sm font-medium mb-2">{t('common:empty.no_kris_configured')}</p>
                    <p className="text-[10px] text-slate-700 max-w-xs mx-auto">{t('overview.kris_help_text', { ns: 'risks' })}</p>
                </div>
            )}
        </motion.div>
    );
}

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
};
