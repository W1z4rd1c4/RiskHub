import { motion } from 'framer-motion';
import { FileText, Plus } from 'lucide-react';

import { KRIGaugeCard } from '@/components/kri/KRIGaugeCard';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
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
            <CardHeader
                icon={FileText}
                title={t('overview.risk_appetite_indicators', { ns: 'risks' })}
                className="mb-0 border-b border-border pb-4"
                actions={canCreateKri ? (
                    <Button variant="outline" size="compact" onClick={onNavigateToNewKri}>
                        <Plus aria-hidden="true" />
                        {t('overview.add_kri', { ns: 'risks' })}
                    </Button>
                ) : undefined}
            />

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
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-2xl">
                    <p className="text-muted-foreground text-sm font-medium mb-2">{t('common:empty.no_kris_configured')}</p>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto">{t('overview.kris_help_text', { ns: 'risks' })}</p>
                </div>
            )}
        </motion.div>
    );
}

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
};
