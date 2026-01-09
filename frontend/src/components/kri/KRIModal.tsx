import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Trash2, Calendar, Activity, Plus, User } from 'lucide-react';
import type { KeyRiskIndicator, KRIUpdate, KRICreate } from '@/types/kri';
import { userApi } from '@/services/userApi';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface KRIModalProps {
    risk_id: number;
    kri?: KeyRiskIndicator | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: KRICreate | KRIUpdate) => Promise<void>;
    onDelete?: (id: number) => Promise<void>;
}

export function KRIModal({ risk_id, kri, isOpen, onClose, onSave, onDelete }: KRIModalProps) {
    const isCreate = !kri;
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const [formData, setFormData] = useState<Partial<KRICreate & KRIUpdate>>({
        metric_name: '',
        current_value: 0,
        lower_limit: 0,
        upper_limit: 100,
        unit: '%',
        frequency: 'quarterly',
        reporting_owner_id: undefined,
    });

    const [users, setUsers] = useState<{ id: number; name: string; email: string }[]>([]);

    useEffect(() => {
        if (kri) {
            setFormData({
                metric_name: kri.metric_name,
                current_value: kri.current_value,
                lower_limit: kri.lower_limit,
                upper_limit: kri.upper_limit,
                unit: kri.unit,
                frequency: kri.frequency || 'quarterly',
                reporting_owner_id: kri.reporting_owner_id,
            });
        } else {
            setFormData({
                metric_name: '',
                current_value: 0,
                lower_limit: 0,
                upper_limit: 100,
                unit: '%',
                frequency: 'quarterly',
                reporting_owner_id: undefined,
            });
        }
    }, [kri, isOpen]);

    // Load users for reporting owner dropdown (scoped visibility)
    useEffect(() => {
        const loadUsers = async () => {
            try {
                const userList = await userApi.listVisibleUsers();
                setUsers(userList);
            } catch (err) {
                console.error('Error loading users:', err);
            }
        };
        loadUsers();
    }, []);

    if (!isOpen) return null;

    const handleSave = async () => {
        try {
            setIsSaving(true);
            const { current_value, ...rest } = formData;
            const data = isCreate ? { ...formData, risk_id } as KRICreate : rest as KRIUpdate;
            await onSave(data);
            onClose();
        } catch (err) {
            console.error('Save failed:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!kri || !onDelete) return;
        try {
            setIsDeleting(true);
            await onDelete(kri.id);
            onClose();
        } catch (err) {
            console.error('Delete failed:', err);
        } finally {
            setIsDeleting(false);
            setIsDeleteDialogOpen(false);
        }
    };

    if (typeof document === 'undefined') return null;

    const mainModal = createPortal(
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
                        className="relative w-full max-w-xl glass-card !p-0 overflow-hidden shadow-2xl"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-accent/10 rounded-lg">
                                    {isCreate ? <Plus className="h-5 w-5 text-accent" /> : <Activity className="h-5 w-5 text-accent" />}
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">{isCreate ? 'Create New KRI' : 'Edit KRI'}</h3>
                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Key Risk Indicator Framework</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Metric Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Payment Rejection Rate"
                                    value={formData.metric_name}
                                    onChange={e => setFormData({ ...formData, metric_name: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all font-medium"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                        {isCreate ? 'Current Value' : 'Current Value (use Record Value)'}
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.current_value}
                                        onChange={e => setFormData({ ...formData, current_value: parseFloat(e.target.value) })}
                                        disabled={!isCreate}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Unit (%, EUR, etc.)</label>
                                    <input
                                        type="text"
                                        value={formData.unit}
                                        onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-rose-500/50 ml-1">Lower Limit (Breach)</label>
                                    <input
                                        type="number"
                                        value={formData.lower_limit}
                                        onChange={e => setFormData({ ...formData, lower_limit: parseFloat(e.target.value) })}
                                        className="w-full bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3 text-white outline-none focus:border-rose-500/50 transition-all font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-rose-500/50 ml-1">Upper Limit (Breach)</label>
                                    <input
                                        type="number"
                                        value={formData.upper_limit}
                                        onChange={e => setFormData({ ...formData, upper_limit: parseFloat(e.target.value) })}
                                        className="w-full bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3 text-white outline-none focus:border-rose-500/50 transition-all font-mono"
                                    />
                                </div>
                            </div>

                            {/* Frequency and Reporting Owner */}
                            <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        Reporting Frequency
                                    </label>
                                    <select
                                        value={formData.frequency || 'quarterly'}
                                        onChange={e => setFormData({ ...formData, frequency: e.target.value as any })}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all appearance-none"
                                    >
                                        <option value="daily" className="bg-slate-900">Daily</option>
                                        <option value="weekly" className="bg-slate-900">Weekly</option>
                                        <option value="monthly" className="bg-slate-900">Monthly</option>
                                        <option value="quarterly" className="bg-slate-900">Quarterly</option>
                                        <option value="annually" className="bg-slate-900">Annually</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        Reporting Owner
                                    </label>
                                    <select
                                        value={formData.reporting_owner_id || ''}
                                        onChange={e => setFormData({ ...formData, reporting_owner_id: e.target.value ? parseInt(e.target.value) : undefined })}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all appearance-none"
                                    >
                                        <option value="" className="bg-slate-900">Risk Owner (Default)</option>
                                        {users.map(user => (
                                            <option key={user.id} value={user.id} className="bg-slate-900">
                                                {user.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {!isCreate && kri && (
                                <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl text-[10px] text-slate-500 font-bold">
                                    <Calendar className="h-3.5 w-3.5" />
                                    LAST UPDATED: {new Date(kri.last_updated).toLocaleString()}
                                </div>
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                            <div>
                                {!isCreate && onDelete && (
                                    <button
                                        onClick={() => setIsDeleteDialogOpen(true)}
                                        disabled={isDeleting}
                                        className="p-3 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                                        title="Delete KRI"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving || !formData.metric_name}
                                    className="px-8 py-2.5 bg-accent rounded-xl text-slate-950 text-xs font-black uppercase tracking-widest hover:shadow-[0_0_20px_rgba(30,132,255,0.4)] transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : <><Save className="h-4 w-4" /> {isCreate ? 'Create indicator' : 'Save Changes'}</>}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );

    return (
        <>
            {mainModal}
            <ConfirmDialog
                isOpen={isDeleteDialogOpen}
                onClose={() => setIsDeleteDialogOpen(false)}
                onConfirm={handleDelete}
                title="Delete KRI"
                message={`Are you sure you want to delete "${kri?.metric_name}"? This action cannot be undone.`}
                confirmLabel="Delete"
                variant="danger"
                isLoading={isDeleting}
            />
        </>
    );
}
