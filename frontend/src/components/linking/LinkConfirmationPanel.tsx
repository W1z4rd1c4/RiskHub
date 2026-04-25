import { AnimatePresence, motion } from 'framer-motion';
import { Link as LinkIcon, Loader2 } from 'lucide-react';

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
                                <p className="text-[10px] text-accent font-black uppercase tracking-widest mb-1">{t('common:linking.confirm_linkage')}</p>
                                <p className="text-sm font-bold text-white leading-tight">
                                    {getResultTitle(mode, selectedResult)}
                                </p>
                            </div>
                            <button
                                onClick={() => onSelectTarget(null)}
                                className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors border border-white/10 rounded-md px-2 py-1"
                            >
                                {t('common:linking.change')}
                            </button>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-1">
                                {mode === 'risk-to-control' && (
                                    <div className="bg-slate-900/50 border border-white/5 rounded-xl p-3">
                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                            {t('common:linking.owner_information')}
                                        </p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-white">
                                                {selectedResult.control_owner_name || t('common:empty.no_manager')}
                                            </span>
                                            <span className="text-[10px] text-slate-500">
                                                {selectedResult.department_name}
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {mode === 'vendor-to-kri' && (
                                    <div className="bg-slate-900/50 border border-white/5 rounded-xl p-3">
                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                            {t('kris:fields.linked_risk')}
                                        </p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-white">
                                                {selectedResult.process || t('common:fallbacks.not_available')}
                                            </span>
                                            <span className="text-[10px] text-slate-500">
                                                {selectedResult.department_name || t('common:fallbacks.unassigned')}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={onLink}
                                disabled={isLinking}
                                className="px-6 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all shadow-lg shadow-accent/20 disabled:opacity-50 h-10 self-end"
                            >
                                {isLinking ? <Loader2 className="h-3 w-3 animate-spin" /> : <LinkIcon className="h-3 w-3" />}
                                {t('common:linking.create_link')}
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
