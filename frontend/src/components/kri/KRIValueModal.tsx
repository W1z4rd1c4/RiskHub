import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Activity, Calendar, Info, CheckCircle } from 'lucide-react';
import { kriApi } from '@/services/kriApi';
import { apiClient } from '@/services/apiClient';
import type { KeyRiskIndicator, KRIRecordValue } from '@/types/kri';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/i18n/hooks';
import { formatDateValue } from '@/i18n/formatters';

interface KRIValueModalProps {
    kri: KeyRiskIndicator;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function KRIValueModal({ kri, isOpen, onClose, onSuccess }: KRIValueModalProps) {
    const { canResolveApprovals } = usePermissions();
    const { t, i18n } = useTranslation(['kris', 'common', 'errorKeys']);
    const [isSaving, setIsSaving] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [submitResult, setSubmitResult] = useState<'success' | 'pending_approval' | null>(null);

    const [formData, setFormData] = useState<KRIRecordValue>({
        value: kri.current_value,
    });

    // Privileged users can backdate and their submissions are applied immediately
    const isPrivileged = canResolveApprovals;

    if (!isOpen) return null;

    const handleSave = async () => {
        try {
            setIsSaving(true);
            setErrorKey(null);
            setSubmitResult(null);

            const response = await kriApi.recordValue(kri.id, formData);

            // Check if response indicates approval required (202 Accepted)
            // The API returns 202 for non-privileged submissions that need approval
            const maybeStatus = response as unknown as { status?: number };
            if (maybeStatus.status === 202) {
                setSubmitResult('pending_approval');
            } else {
                setSubmitResult('success');
                // For immediate success, trigger refresh and close
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 1500);
            }
        } catch (err: unknown) {
            console.error('Record value failed:', err);
            setErrorKey(apiClient.toUiMessageKey(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = () => {
        if (submitResult === 'pending_approval') {
            onSuccess(); // Refresh parent to update UI
        }
        setSubmitResult(null);
        setErrorKey(null);
        onClose();
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
                        onClick={handleClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-md glass-card !p-0 overflow-hidden shadow-2xl"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-accent/10 rounded-lg">
                                    <Activity className="h-5 w-5 text-accent" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">{t('value_modal.title', { ns: 'kris' })}</h3>
                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{kri.metric_name}</p>
                                </div>
                            </div>
                            <button onClick={handleClose} className="p-2 text-slate-500 hover:text-white transition-colors">
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            {/* Success State */}
                            {submitResult === 'success' && (
                                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-400">
                                    <CheckCircle className="h-5 w-5" />
                                    <span className="text-sm font-medium">{t('value_modal.success_recorded', { ns: 'kris' })}</span>
                                </div>
                            )}

                            {/* Pending Approval State */}
                            {submitResult === 'pending_approval' && (
                                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                                    <div className="flex items-center gap-3 text-amber-400">
                                        <Info className="h-5 w-5" />
                                        <span className="text-sm font-medium">{t('value_modal.submitted_for_approval', { ns: 'kris' })}</span>
                                    </div>
                                    <p className="text-xs text-slate-400 ml-8">
                                        {t('value_modal.submitted_for_approval_help', { ns: 'kris' })}
                                    </p>
                                </div>
                            )}

                            {errorKey && (
                                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
                                    {t(errorKey, { ns: 'errorKeys' })}
                                </div>
                            )}

                            {/* Only show form if not submitted yet */}
                            {!submitResult && (
                                <>
                                    {/* Approval Notice for Non-Privileged Users */}
                                    {!isPrivileged && (
                                        <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl flex items-start gap-3">
                                            <Info className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                                            <p className="text-xs text-amber-300/70">
                                                {t('value_modal.approval_notice', { ns: 'kris' })}
                                            </p>
                                        </div>
                                    )}

                                    {/* Current Context */}
                                    <div className="px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl">
                                        <div className="flex items-center justify-between text-xs text-slate-500">
                                            <span>{t('value_modal.current_value', { ns: 'kris' })}</span>
                                            <span className="font-bold text-white">{kri.current_value} {kri.unit}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                                            <span>{t('common:labels.limits')}</span>
                                            <span className="font-bold text-white">{kri.lower_limit} – {kri.upper_limit}</span>
                                        </div>
                                        {kri.last_period_end && (
                                            <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                                                <span>{t('value_modal.last_period_end', { ns: 'kris' })}</span>
                                                <span className="font-bold text-white">{formatDateValue(kri.last_period_end, i18n.language)}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Value Input */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                            {t('value_modal.new_value_required', { ns: 'kris' })}
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.value}
                                            onChange={e => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all font-mono text-lg"
                                            autoFocus
                                        />
                                    </div>

                                    {/* Backdating - Only for privileged users */}
                                    {isPrivileged && (
                                        <div className="space-y-2 pt-4 border-t border-white/5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-amber-500/50 ml-1 flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {t('value_modal.backdate_optional', { ns: 'kris' })}
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.period_end || ''}
                                                onChange={e => setFormData({ ...formData, period_end: e.target.value || undefined })}
                                                className="w-full bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 text-white outline-none focus:border-amber-500/50 transition-all"
                                            />
                                            <p className="text-[9px] text-slate-600 ml-1">
                                                {t('value_modal.backdate_hint', { ns: 'kris' })}
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-end gap-3">
                            <button
                                onClick={handleClose}
                                className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                            >
                                {submitResult ? t('common:actions.close') : t('common:actions.cancel')}
                            </button>
                            {!submitResult && (
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="px-8 py-2.5 bg-accent rounded-xl text-slate-950 text-xs font-black uppercase tracking-widest hover:shadow-lg hover:shadow-accent/35 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isSaving ? t('common:loading.generic') : <><Save className="h-4 w-4" /> {t('value_modal.title', { ns: 'kris' })}</>}
                                </button>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
