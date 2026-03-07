import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { controlApi } from '@/services/controlApi';
import { apiClient } from '@/services/apiClient';
import { useTranslation } from '@/i18n/hooks';
import type { ControlExecutionCreate } from '@/types/execution';
import { ExecutionResult } from '@/types/execution';
import { getExecutionResultMeta } from '@/lib/executionResult';

interface ExecutionLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    controlId: number;
    controlName: string;
    onSuccess?: () => void;
}

const RESULTS: ExecutionResult[] = [
    ExecutionResult.PASSED,
    ExecutionResult.FAILED,
    ExecutionResult.WARNING,
    ExecutionResult.NA,
];

export function ExecutionLogModal({ isOpen, onClose, controlId, controlName, onSuccess }: ExecutionLogModalProps) {
    const { t } = useTranslation(['controls', 'common', 'errorKeys']);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [formData, setFormData] = useState<ControlExecutionCreate>({
        result: 'passed',
        findings: '',
        evidence_reference: '',
        notes: '',
        next_scheduled: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorKey(null);

        try {
            await controlApi.logExecution(controlId, {
                ...formData,
                next_scheduled: formData.next_scheduled || undefined,
            });
            onSuccess?.();
            onClose();
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
                        className="glass-card w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div>
                                <h3 className="text-xl font-bold text-white mb-1">{t('executions.log_execution')}</h3>
                                <p className="text-sm text-slate-500 font-medium">{t('executions.recording_performance_for')}: <span className="text-accent">{controlName}</span></p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/5 rounded-full text-slate-500 hover:text-white transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                            {errorKey && (
                                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-medium flex gap-3">
                                    <AlertTriangle className="h-5 w-5 shrink-0" />
                                    {t(errorKey, { ns: 'errorKeys' })}
                                </div>
                            )}

                            {/* Result Selection */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{t('executions.execution_result')}</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {RESULTS.map((res) => {
                                        const meta = getExecutionResultMeta(res);
                                        const ResultIcon = meta.icon;
                                        const isSelected = formData.result === res;
                                        return (
                                            <button
                                                key={res}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, result: res })}
                                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                                                    isSelected
                                                        ? meta.badgeClassName
                                                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-400'
                                                }`}
                                            >
                                                <ResultIcon className={`h-5 w-5 ${isSelected ? meta.iconClassName : 'text-slate-500'}`} />
                                                <span className={`text-sm font-bold ${isSelected ? 'text-white' : ''}`}>
                                                    {t(meta.labelKey)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Findings */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{t('executions.findings_observations')}</label>
                                <textarea
                                    value={formData.findings}
                                    onChange={(e) => setFormData({ ...formData, findings: e.target.value })}
                                    placeholder={t('form.placeholders.verification_notes')}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent/50 min-h-[100px] transition-all resize-none"
                                />
                            </div>

                            {/* Evidence Reference */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{t('executions.evidence_reference')}</label>
                                <input
                                    type="text"
                                    value={formData.evidence_reference}
                                    onChange={(e) => setFormData({ ...formData, evidence_reference: e.target.value })}
                                    placeholder={t('form.placeholders.evidence_reference')}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent/50 transition-all"
                                />
                            </div>

                            {/* Next Scheduled */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{t('executions.next_scheduled_optional')}</label>
                                <input
                                    type="date"
                                    value={formData.next_scheduled}
                                    onChange={(e) => setFormData({ ...formData, next_scheduled: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent/50 transition-all [color-scheme:dark]"
                                />
                            </div>

                            {/* Additional Notes */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{t('executions.additional_notes')}</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder={t('form.placeholders.additional_notes')}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent/50 min-h-[80px] transition-all resize-none"
                                />
                            </div>
                        </form>

                        {/* Footer */}
                        <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-6 py-2.5 rounded-xl border border-white/10 text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                            >
                                {t('actions.cancel', { ns: 'common' })}
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="btn-primary min-w-[140px] flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {t('executions.logging')}
                                    </>
                                ) : (
                                    t('executions.log_execution')
                                )}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
