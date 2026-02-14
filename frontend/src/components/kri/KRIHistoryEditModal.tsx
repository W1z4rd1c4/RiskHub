import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Edit3, AlertCircle, CheckCircle } from 'lucide-react';
import { kriApi } from '@/services/kriApi';
import { apiClient } from '@/services/apiClient';
import { Button } from '@/components/ui/button';
import type { KRIHistoryEntry, KRIHistoryEdit } from '@/types/kri';
import { useTranslation } from '@/i18n/hooks';

interface KRIHistoryEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    kriId: number;
    entry: KRIHistoryEntry;
    onSuccess: () => void;
}

export function KRIHistoryEditModal({ isOpen, onClose, kriId, entry, onSuccess }: KRIHistoryEditModalProps) {
    const { t, i18n } = useTranslation(['kris', 'common', 'errorKeys']);
    const [newValue, setNewValue] = useState(entry.value.toString());
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ type: 'success' | 'approval'; messageKey: string; approvalId?: number } | null>(null);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorKey(null);
        setResult(null);

        try {
            const data: KRIHistoryEdit = {
                value: parseFloat(newValue),
                reason: reason.trim(),
            };
            const response = await kriApi.requestHistoryEdit(kriId, entry.id, data);

            if ('approval_id' in response) {
                // 202 - Approval required
                setResult({ type: 'approval', messageKey: 'correction.approval_submitted_with_id', approvalId: response.approval_id });
            } else {
                // 200 - Immediate update
                setResult({ type: 'success', messageKey: 'correction.success' });
            }

            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1500);
        } catch (err: unknown) {
            setErrorKey(apiClient.toUiMessageKey(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="glass-card w-full max-w-md"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-6 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                    <Edit3 className="h-5 w-5 text-amber-400" />
                                </div>
                                <div>
                                    <h2 className="text-white font-bold">{t('history_edit.request_correction', { ns: 'kris' })}</h2>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                                        {t('history_edit.period', { ns: 'kris' })}: {new Date(entry.period_end).toLocaleDateString(i18n.language)}
                                    </p>
                                </div>
                            </div>
                            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {/* CRO Approval Warning */}
                            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />
                                <span className="text-xs font-medium text-amber-400">{t('correction.warning')}</span>
                            </div>
                            {result && (
                                <div className={`p-4 rounded-lg flex items-center gap-3 ${result.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                    {result.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                                    <span className="text-sm">
                                        {result.approvalId
                                            ? t(result.messageKey, { approvalId: result.approvalId })
                                            : t(result.messageKey)}
                                    </span>
                                </div>
                            )}

                            {errorKey && (
                                <div className="p-4 rounded-lg bg-rose-500/10 text-rose-400 flex items-center gap-3">
                                    <AlertCircle className="h-5 w-5" />
                                    <span className="text-sm">{t(errorKey, { ns: 'errorKeys' })}</span>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {t('values.original_value', { ns: 'kris' })}
                                </label>
                                <div className="px-4 py-3 bg-white/5 rounded-lg text-white font-mono">
                                    {entry.value} {entry.unit}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {t('history_edit.corrected_value_required', { ns: 'kris' })}
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    value={newValue}
                                    onChange={(e) => setNewValue(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {t('history_edit.reason_required', { ns: 'kris' })}
                                </label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    required
                                    rows={3}
                                    placeholder={t('form.placeholders.correction_reason')}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 resize-none"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                                    {t('actions.cancel', { ns: 'common' })}
                                </Button>
                                <Button type="submit" disabled={isSubmitting || !reason.trim()} className="flex-1">
                                    {isSubmitting ? t('history_edit.submitting', { ns: 'kris' }) : t('correction.submit', { ns: 'kris' })}
                                </Button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
