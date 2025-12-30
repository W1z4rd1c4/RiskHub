import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Activity, Calendar } from 'lucide-react';
import { kriApi } from '@/services/kriApi';
import type { KeyRiskIndicator, KRIRecordValue } from '@/types/kri';
import { useAuth } from '@/contexts/AuthContext';

interface KRIValueModalProps {
    kri: KeyRiskIndicator;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function KRIValueModal({ kri, isOpen, onClose, onSuccess }: KRIValueModalProps) {
    const { user } = useAuth();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState<KRIRecordValue>({
        value: kri.current_value,
    });

    // Check if user has privileged access (can backdate)
    const roleName = user?.role && typeof user.role === 'object' && 'name' in user.role ? (user.role as { name: string }).name : '';
    const isPrivileged = ['Admin', 'CRO', 'Risk Manager'].includes(roleName);

    if (!isOpen) return null;

    const handleSave = async () => {
        try {
            setIsSaving(true);
            setError(null);
            await kriApi.recordValue(kri.id, formData);
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Record value failed:', err);
            setError(err.response?.data?.detail || err.message || 'Failed to record value');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
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
                                <h3 className="text-xl font-black text-white">Record Value</h3>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{kri.metric_name}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="p-8 space-y-6">
                        {error && (
                            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Current Context */}
                        <div className="px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                                <span>Current Value:</span>
                                <span className="font-bold text-white">{kri.current_value} {kri.unit}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                                <span>Limits:</span>
                                <span className="font-bold text-white">{kri.lower_limit} – {kri.upper_limit}</span>
                            </div>
                            {kri.last_period_end && (
                                <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                                    <span>Last Period End:</span>
                                    <span className="font-bold text-white">{new Date(kri.last_period_end).toLocaleDateString()}</span>
                                </div>
                            )}
                        </div>

                        {/* Value Input */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                New Value *
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
                                    Backdate Period End (Optional)
                                </label>
                                <input
                                    type="date"
                                    value={formData.period_end || ''}
                                    onChange={e => setFormData({ ...formData, period_end: e.target.value || undefined })}
                                    className="w-full bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 text-white outline-none focus:border-amber-500/50 transition-all"
                                />
                                <p className="text-[9px] text-slate-600 ml-1">
                                    Leave empty to record for current period
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-8 py-2.5 bg-accent rounded-xl text-slate-950 text-xs font-black uppercase tracking-widest hover:shadow-[0_0_20px_rgba(30,132,255,0.4)] transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSaving ? 'Saving...' : <><Save className="h-4 w-4" /> Record Value</>}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
