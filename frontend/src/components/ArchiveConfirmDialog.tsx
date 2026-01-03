import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Loader2, AlertTriangle } from 'lucide-react';

interface ArchiveConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<void>;
    resourceType: 'control' | 'risk';
    resourceName: string;
}

export function ArchiveConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    resourceType,
    resourceName
}: ArchiveConfirmDialogProps) {
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!reason.trim()) {
            setError('Please provide a reason for archiving.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await onConfirm(reason.trim());
            setReason('');
            onClose();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : `Failed to archive ${resourceType}.`;
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (isSubmitting) return;
        setReason('');
        setError(null);
        onClose();
    };

    if (typeof document === 'undefined') return null;
    if (!isOpen) return null;

    return createPortal(
        <AnimatePresence>
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
                    className="glass-card w-full max-w-md overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-white/5 bg-rose-500/5">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                    <Trash2 className="h-5 w-5 text-rose-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Archive {resourceType === 'control' ? 'Control' : 'Risk'}</h3>
                                    <p className="text-sm text-slate-500 font-medium mt-0.5">This action can be undone by an administrator.</p>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                disabled={isSubmitting}
                                className="p-2 hover:bg-white/5 rounded-full text-slate-500 hover:text-white transition-colors disabled:opacity-50"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Archiving</p>
                            <p className="text-white font-bold truncate">{resourceName}</p>
                        </div>

                        {error && (
                            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-medium flex gap-3">
                                <AlertTriangle className="h-5 w-5 shrink-0" />
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                Reason for Archiving <span className="text-rose-400">*</span>
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="e.g., Control is no longer needed, superseded by new process..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-400/50 min-h-[100px] transition-all resize-none"
                                autoFocus
                                disabled={isSubmitting}
                            />
                        </div>
                    </form>

                    {/* Footer */}
                    <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isSubmitting}
                            className="px-6 py-2.5 rounded-xl border border-white/10 text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            onClick={handleSubmit}
                            disabled={isSubmitting || !reason.trim()}
                            className="px-6 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm font-bold hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[120px] justify-center"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Archiving...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="h-4 w-4" />
                                    Archive
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
