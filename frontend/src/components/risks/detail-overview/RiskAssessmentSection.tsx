import { motion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';

import { RiskScoreMatrix } from '@/components/RiskScoreMatrix';
import { useTranslation } from '@/i18n/hooks';
import type { Risk } from '@/types/risk';

interface RiskAssessmentSectionProps {
    risk: Risk;
}

export function RiskAssessmentSection({ risk }: RiskAssessmentSectionProps) {
    const { t } = useTranslation(['risks']);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card"
        >
            <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-6">
                <ShieldAlert className="h-5 w-5 text-accent" />
                <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('tabs.assessment', { ns: 'risks' })}</h3>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24 py-4">
                <RiskScoreMatrix
                    probability={risk.gross_probability}
                    impact={risk.gross_impact}
                    type="gross"
                    size="medium"
                />

                <div className="hidden md:block w-px h-32 bg-white/10" />
                <div className="md:hidden w-32 h-px bg-white/10" />

                <RiskScoreMatrix
                    probability={risk.net_probability}
                    impact={risk.net_impact}
                    type="net"
                    size="medium"
                />
            </div>
        </motion.div>
    );
}
