import { AnimatePresence, motion } from 'framer-motion';
import { Link as LinkIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';

import { getResultTitle } from './linkSearchPresentation';
import type { LinkMode, SearchResultItem } from './linkTypes';

interface LinkConfirmationPanelProps {
    mode: LinkMode;
    selectedTargetId: number | null;
    selectedResult: SearchResultItem | undefined;
    onSelectTarget: (id: number | null) => void;
    onLink: () => void;
    isLinking: boolean;
}

export function LinkConfirmationPanel({
    mode,
    selectedTargetId,
    selectedResult,
    onSelectTarget,
    onLink,
    isLinking,
}: LinkConfirmationPanelProps) {
    const { t } = useTranslation(['common', 'controls', 'kris', 'risks']);

    return (
        <AnimatePresence>
            {selectedTargetId && selectedResult && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                >
                    <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 space-y-4">
                        <div className="flex justify-between items-start">
                            <div className="flex-1 pr-4">
                                <p className="text-eyebrow mb-1 text-accent-text">{t('common:linking.confirm_linkage')}</p>
                                <p className="text-sm font-bold text-foreground leading-tight">
                                    {getResultTitle(mode, selectedResult)}
                                </p>
                            </div>
                            <Button variant="outline" size="compact" onClick={() => onSelectTarget(null)}>
                                {t('common:linking.change')}
                            </Button>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-1">
                                {mode === 'risk-to-control' && (
                                    <div className="bg-nested border border-border rounded-xl p-3">
                                        <p className="text-eyebrow mb-1.5 flex items-center gap-2">
                                            {t('common:linking.owner_information')}
                                        </p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-foreground">
                                                {selectedResult.control_owner_name || t('common:empty.no_manager')}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {selectedResult.department_name}
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {mode === 'vendor-to-kri' && (
                                    <div className="bg-nested border border-border rounded-xl p-3">
                                        <p className="text-eyebrow mb-1.5">
                                            {t('kris:fields.linked_risk')}
                                        </p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-foreground">
                                                {selectedResult.process || t('common:fallbacks.not_available')}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {selectedResult.department_name || t('common:fallbacks.unassigned')}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <Button variant="accent" onClick={onLink} isLoading={isLinking} className="self-end">
                                {isLinking ? null : <LinkIcon aria-hidden="true" />}
                                {t('common:linking.create_link')}
                            </Button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
