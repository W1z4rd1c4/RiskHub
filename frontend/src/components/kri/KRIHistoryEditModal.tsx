import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Edit3, AlertCircle, CheckCircle } from 'lucide-react';
import { kriApi } from '@/services/kriApi';
import { Button } from '@/components/ui/button';
import type { KRIHistoryEntry, KRIHistoryEdit } from '@/types/kri';

interface KRIHistoryEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    kriId: number;
    entry: KRIHistoryEntry;
    onSuccess: () => void;
}

export function KRIHistoryEditModal({ isOpen, onClose, kriId, entry, onSuccess }: KRIHistoryEditModalProps) {
    const [newValue, setNewValue] = useState(entry.value.toString());
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ type: 'success' | 'approval'; message: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        setResult(null);

        try {
            const data: KRIHistoryEdit = {
                value: parseFloat(newValue),
                reason: reason.trim(),
            };
            const response = await kriApi.requestHistoryEdit(kriId, entry.id, data);

            if ('approval_id' in response) {
                // 202 - Approval required
                setResult({ type: 'approval', message: `Correction request submitted. Approval ID: ${response.approval_id}` });
            } else {
                // 200 - Immediate update
                setResult({ type: 'success', message: 'History entry corrected successfully.' });
            }

            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1500);
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to submit correction request.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
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
                                <h2 className="text-white font-bold">Request Correction</h2>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                                    Period: {new Date(entry.period_end).toLocaleDateString()}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {result && (
                            <div className={`p-4 rounded-lg flex items-center gap-3 ${result.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                {result.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                                <span className="text-sm">{result.message}</span>
                            </div>
                        )}

                        {error && (
                            <div className="p-4 rounded-lg bg-rose-500/10 text-rose-400 flex items-center gap-3">
                                <AlertCircle className="h-5 w-5" />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                Original Value
                            </label>
                            <div className="px-4 py-3 bg-white/5 rounded-lg text-white font-mono">
                                {entry.value} {entry.unit}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                Corrected Value *
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
                                Reason for Correction *
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                required
                                rows={3}
                                placeholder="Explain why this correction is needed..."
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 resize-none"
                            />
                        </div>

                        <div className="flex gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting || !reason.trim()} className="flex-1">
                                {isSubmitting ? 'Submitting...' : 'Submit Correction'}
                            </Button>
                        </div>
                    </form>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
