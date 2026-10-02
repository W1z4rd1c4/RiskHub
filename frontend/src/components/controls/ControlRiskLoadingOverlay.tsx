import { AnimatePresence, motion } from 'framer-motion';

import { useTranslation } from '@/i18n/hooks';
import { Spinner } from '@/components/ui/state';

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
                    className="fixed inset-0 z-modal-overlay flex items-center justify-center bg-overlay backdrop-blur-[2px]"
                >
                    <div className="glass-card !p-6 shadow-2xl flex flex-col items-center gap-4">
                        <Spinner size="lg" />
                        <p className="text-eyebrow">
                            {t('detail.fetching_risk_details')}
                        </p>
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
