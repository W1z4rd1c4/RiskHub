import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertTriangle, XCircle, MinusCircle, Loader2 } from 'lucide-react';
import { executionApi } from '@/services/executionApi';
import type { ControlExecutionCreate } from '@/services/executionApi';
import { useTranslation } from 'react-i18next';

interface ExecutionLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    controlId: number;
    controlName: string;
    onSuccess?: () => void;
}

const RESULTS = [
    { value: 'passed' as const, label: 'Passed', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { value: 'failed' as const, label: 'Failed', icon: XCircle, color: 'text-rose-400', bg: 'bg-rose-400/10' },
    { value: 'warning' as const, label: 'Issues Found', icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { value: 'not_applicable' as const, label: 'N/A', icon: MinusCircle, color: 'text-slate-400', bg: 'bg-slate-400/10' },
];

export function ExecutionLogModal({ isOpen, onClose, controlId, controlName, onSuccess }: ExecutionLogModalProps) {
    const { t } = useTranslation('controls');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState<Omit<ControlExecutionCreate, 'control_id'>>({
        result: 'passed',
        findings: '',
        evidence_reference: '',
        notes: '',
        next_scheduled: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            await executionApi.createExecution({
                ...formData,
                control_id: controlId,
                next_scheduled: formData.next_scheduled || undefined,
            });
            onSuccess?.();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to log execution');
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
                                <h3 className="text-xl font-bold text-white mb-1">Log Control Execution</h3>
                                <p className="text-sm text-slate-500 font-medium">Recording performance for: <span className="text-accent">{controlName}</span></p>
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
                            {error && (
                                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-medium flex gap-3">
                                    <AlertTriangle className="h-5 w-5 shrink-0" />
                                    {error}
                                </div>
                            )}

                            {/* Result Selection */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Execution Result</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {RESULTS.map((res) => (
                                        <button
                                            key={res.value}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, result: res.value })}
                                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${formData.result === res.value
                                                ? `${res.bg} border-${res.color.split('-')[1]}-500/50`
                                                : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-400'
                                                }`}
                                        >
                                            <res.icon className={`h-5 w-5 ${formData.result === res.value ? res.color : 'text-slate-500'}`} />
                                            <span className={`text-sm font-bold ${formData.result === res.value ? 'text-white' : ''}`}>
                                                {res.label}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Findings */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Findings / Observations</label>
                                <textarea
                                    value={formData.findings}
                                    onChange={(e) => setFormData({ ...formData, findings: e.target.value })}
                                    placeholder={t('form.placeholders.verification_notes')}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent/50 min-h-[100px] transition-all resize-none"
                                />
                            </div>

                            {/* Evidence Reference */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Evidence Reference (Link/File ID)</label>
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
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Next Scheduled Execution (Optional)</label>
                                <input
                                    type="date"
                                    value={formData.next_scheduled}
                                    onChange={(e) => setFormData({ ...formData, next_scheduled: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent/50 transition-all [color-scheme:dark]"
                                />
                            </div>

                            {/* Additional Notes */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Additional Notes</label>
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
                                Cancel
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
                                        Logging...
                                    </>
                                ) : (
                                    'Log Execution'
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
