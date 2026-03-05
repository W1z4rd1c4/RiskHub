import { AnimatePresence, motion } from 'framer-motion';

import type { SafeTFunction } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import type { ApprovalRequest } from '@/types/approval';

interface ApprovalResolutionDialogProps {
    selectedApproval: ApprovalRequest | null;
    dialogMode: 'approve' | 'reject' | null;
    resolutionNotes: string;
    isSubmitting: boolean;
    onClose: () => void;
    onResolve: () => void;
    onResolutionNotesChange: (value: string) => void;
    t: SafeTFunction;
}

export function ApprovalResolutionDialog({
    selectedApproval,
    dialogMode,
    resolutionNotes,
    isSubmitting,
    onClose,
    onResolve,
    onResolutionNotesChange,
    t,
}: ApprovalResolutionDialogProps) {
    return (
        <AnimatePresence>
            {selectedApproval && dialogMode && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="relative w-full max-w-lg glass rounded-2xl shadow-2xl overflow-hidden"
                    >
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-white mb-2">
                                {dialogMode === 'approve'
                                    ? t('dialogs.approve_title')
                                    : t('dialogs.reject_title')}
                            </h3>
                            <p className="text-sm text-slate-400 mb-6">{t('dialogs.resolution_required')}</p>

                            <textarea
                                value={resolutionNotes}
                                onChange={(event) => onResolutionNotesChange(event.target.value)}
                                placeholder={t('dialogs.resolution_placeholder')}
                                className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-slate-600 outline-none focus:border-accent/50 resize-none"
                            />

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                                >
                                    {t('actions.cancel')}
                                </button>
                                <button
                                    onClick={onResolve}
                                    disabled={isSubmitting || !resolutionNotes.trim()}
                                    className={cn(
                                        'px-6 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50',
                                        dialogMode === 'approve'
                                            ? 'bg-emerald-500 hover:bg-emerald-600'
                                            : 'bg-rose-500 hover:bg-rose-600',
                                    )}
                                >
                                    {isSubmitting
                                        ? t('dialogs.processing')
                                        : dialogMode === 'approve'
                                          ? t('actions.approve')
                                          : t('actions.reject')}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
