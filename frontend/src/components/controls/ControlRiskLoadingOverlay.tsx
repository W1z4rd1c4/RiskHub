import { AnimatePresence, motion } from 'framer-motion';

import { useTranslation } from '@/i18n/hooks';

interface ControlRiskLoadingOverlayProps {
    isVisible: boolean;
}

/** Non-modal busy overlay shown while a linked risk is being fetched. */
export function ControlRiskLoadingOverlay({ isVisible }: ControlRiskLoadingOverlayProps) {
    const { t } = useTranslation('controls');

    return (
        <AnimatePresence>
            {isVisible ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    role="status"
                    aria-busy="true"
                    className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]"
                >
                    <div className="glass-card !p-6 shadow-2xl flex flex-col items-center gap-4">
                        <div aria-hidden="true" className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                            {t('detail.fetching_risk_details')}
                        </p>
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
