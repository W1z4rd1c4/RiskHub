import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Calendar, Plus, Save, Trash2, User as UserIcon, X } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { userApi } from '@/services/userApi';
import { vendorSlaApi } from '@/services/vendorSlaApi';
import type { VendorSLA, VendorSLACreate, VendorSLAFrequency, VendorSLAUpdate } from '@/types/vendorSla';

interface VendorSLAModalProps {
    vendorId: number;
    sla?: VendorSLA | null;
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => Promise<void>;
    canManage: boolean;
    canDelete: boolean;
}

export function VendorSLAModal({ vendorId, sla, isOpen, onClose, onSaved, canManage, canDelete }: VendorSLAModalProps) {
    const { t } = useTranslation('vendors');
    const isCreate = !sla;
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [users, setUsers] = useState<{ id: number; name: string; email: string }[]>([]);

    const [recordValue, setRecordValue] = useState<number>(0);
    const [isRecording, setIsRecording] = useState(false);

    const [formData, setFormData] = useState<Partial<VendorSLACreate & VendorSLAUpdate>>({
        metric_name: '',
        description: '',
        current_value: 0,
        lower_limit: 0,
        upper_limit: 100,
        unit: '%',
        frequency: 'monthly',
        reporting_owner_id: undefined,
    });

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

    useEffect(() => {
        if (!isOpen) return;
        if (sla) {
            setFormData({
                metric_name: sla.metric_name,
                description: sla.description || '',
                current_value: sla.current_value ?? 0,
                lower_limit: sla.lower_limit ?? 0,
                upper_limit: sla.upper_limit ?? 0,
                unit: sla.unit || '%',
                frequency: (sla.frequency || 'monthly') as VendorSLAFrequency,
                reporting_owner_id: sla.reporting_owner_id ?? undefined,
            });
            setRecordValue(sla.current_value ?? 0);
        } else {
            setFormData({
                metric_name: '',
                description: '',
                current_value: 0,
                lower_limit: 0,
                upper_limit: 100,
                unit: '%',
                frequency: 'monthly',
                reporting_owner_id: undefined,
            });
            setRecordValue(0);
        }
    }, [sla, isOpen]);

    const ownerOptions = useMemo(
        () => users.map((u) => ({ value: String(u.id), label: `${u.name} (${u.email})` })),
        [users],
    );

    const frequencyOptions = useMemo(
        () => [
            { value: 'daily', label: t('sla.frequency.daily') },
            { value: 'weekly', label: t('sla.frequency.weekly') },
            { value: 'monthly', label: t('sla.frequency.monthly') },
            { value: 'quarterly', label: t('sla.frequency.quarterly') },
            { value: 'annually', label: t('sla.frequency.annually') },
        ],
        [t],
    );

    const save = async () => {
        if (!canManage) return;
        if (!formData.metric_name?.trim()) return;
        try {
            setIsSaving(true);
            if (isCreate) {
                const payload: VendorSLACreate = {
                    vendor_id: vendorId,
                    metric_name: formData.metric_name.trim(),
                    description: (formData.description || '').trim(),
                    current_value: Number(formData.current_value || 0),
                    lower_limit: Number(formData.lower_limit || 0),
                    upper_limit: Number(formData.upper_limit || 0),
                    unit: (formData.unit || '').trim() || '%',
                    frequency: (formData.frequency || 'monthly') as VendorSLAFrequency,
                    reporting_owner_id: formData.reporting_owner_id ? Number(formData.reporting_owner_id) : null,
                };
                await vendorSlaApi.create(payload);
            } else if (sla) {
                const payload: VendorSLAUpdate = {
                    metric_name: formData.metric_name?.trim(),
                    description: (formData.description || '').trim(),
                    lower_limit: Number(formData.lower_limit || 0),
                    upper_limit: Number(formData.upper_limit || 0),
                    unit: (formData.unit || '').trim() || '%',
                    frequency: (formData.frequency || sla.frequency) as VendorSLAFrequency,
                    reporting_owner_id: formData.reporting_owner_id ? Number(formData.reporting_owner_id) : null,
                };
                await vendorSlaApi.update(sla.id, payload);
            }
            await onSaved();
            onClose();
        } catch (err) {
            console.error('Failed to save vendor SLA:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const archive = async () => {
        if (!sla || !canDelete) return;
        try {
            setIsDeleting(true);
            await vendorSlaApi.archive(sla.id);
            await onSaved();
            onClose();
        } catch (err) {
            console.error('Failed to archive vendor SLA:', err);
        } finally {
            setIsDeleting(false);
            setIsDeleteDialogOpen(false);
        }
    };

    const restore = async () => {
        if (!sla || !canDelete) return;
        try {
            setIsDeleting(true);
            await vendorSlaApi.restore(sla.id);
            await onSaved();
            onClose();
        } catch (err) {
            console.error('Failed to restore vendor SLA:', err);
        } finally {
            setIsDeleting(false);
        }
    };

    const record = async () => {
        if (!sla) return;
        try {
            setIsRecording(true);
            await vendorSlaApi.recordValue(sla.id, { value: Number(recordValue) });
            await onSaved();
        } catch (err) {
            console.error('Failed to record SLA value:', err);
        } finally {
            setIsRecording(false);
        }
    };

    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
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
                        className="relative w-full max-w-2xl glass-card !p-0 overflow-hidden shadow-2xl"
                    >
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-accent/10 rounded-lg">
                                    {isCreate ? <Plus className="h-5 w-5 text-accent" /> : <Activity className="h-5 w-5 text-accent" />}
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">
                                        {isCreate ? t('sla.modal.create_title') : t('sla.modal.edit_title')}
                                    </h3>
                                    <p className="text-xs text-slate-500 font-medium">
                                        {t('sla.modal.subtitle')}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={onClose}
                                className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                            >
                                <X className="h-5 w-5 text-slate-300" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2 col-span-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                        {t('sla.fields.metric_name')}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.metric_name}
                                        onChange={(e) => setFormData({ ...formData, metric_name: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                        placeholder={t('sla.fields.metric_name_placeholder')}
                                    />
                                </div>

                                <div className="space-y-2 col-span-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                        {t('sla.fields.description')}
                                    </label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        rows={2}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                        placeholder={t('sla.fields.description_placeholder')}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                        {isCreate ? t('sla.fields.current_value') : t('sla.fields.current_value_edit_hint')}
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.current_value}
                                        onChange={(e) => setFormData({ ...formData, current_value: Number(e.target.value) })}
                                        disabled={!isCreate}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                        {t('sla.fields.unit')}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.unit}
                                        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                        placeholder="%"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 pt-2">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-rose-500/50 ml-1">
                                        {t('sla.fields.lower_limit')}
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.lower_limit}
                                        onChange={(e) => setFormData({ ...formData, lower_limit: Number(e.target.value) })}
                                        className="w-full bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3 text-white outline-none focus:border-rose-500/50 transition-all font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-rose-500/50 ml-1">
                                        {t('sla.fields.upper_limit')}
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.upper_limit}
                                        onChange={(e) => setFormData({ ...formData, upper_limit: Number(e.target.value) })}
                                        className="w-full bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3 text-white outline-none focus:border-rose-500/50 transition-all font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 pt-2 border-t border-white/5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {t('sla.fields.frequency')}
                                    </label>
                                    <ThemedSelect
                                        value={formData.frequency || 'monthly'}
                                        onValueChange={(v) => setFormData({ ...formData, frequency: v as VendorSLAFrequency })}
                                        className="w-full"
                                        options={frequencyOptions}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 flex items-center gap-1">
                                        <UserIcon className="h-3 w-3" />
                                        {t('sla.fields.reporting_owner')}
                                    </label>
                                    <ThemedSelect
                                        value={formData.reporting_owner_id ? String(formData.reporting_owner_id) : ''}
                                        onValueChange={(v) => setFormData({ ...formData, reporting_owner_id: v ? Number(v) : undefined })}
                                        className="w-full"
                                        options={ownerOptions}
                                        allowEmpty
                                        emptyLabel={t('sla.owner.unassigned')}
                                    />
                                </div>
                            </div>

                            {!isCreate && sla && (
                                <div className="pt-2 border-t border-white/5 space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        {t('sla.record.title')}
                                    </p>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="number"
                                            value={recordValue}
                                            onChange={(e) => setRecordValue(Number(e.target.value))}
                                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={record}
                                            disabled={isRecording || !!sla?.is_archived}
                                            className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-200 font-bold hover:bg-white/10 transition-colors disabled:opacity-60"
                                        >
                                            {isRecording ? t('sla.record.saving') : t('sla.record.save')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div>
                                {!isCreate && sla && canDelete && (
                                    sla.is_archived ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void restore();
                                            }}
                                            disabled={isDeleting}
                                            className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-bold hover:bg-emerald-500/20 transition-colors flex items-center gap-2 disabled:opacity-60"
                                        >
                                            {t('actions.unarchive')}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setIsDeleteDialogOpen(true)}
                                            disabled={isDeleting}
                                            className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 font-bold hover:bg-rose-500/20 transition-colors flex items-center gap-2 disabled:opacity-60"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            {t('sla.actions.archive')}
                                        </button>
                                    )
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 font-bold hover:bg-white/10 transition-colors"
                                >
                                    {t('actions.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={save}
                                    disabled={!canManage || isSaving || !formData.metric_name?.trim() || !!sla?.is_archived}
                                    className="px-4 py-2 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-colors flex items-center gap-2 disabled:opacity-60"
                                >
                                    <Save className="h-4 w-4" />
                                    {t('actions.save')}
                                </button>
                            </div>
                        </div>
                    </motion.div>

                    <ConfirmDialog
                        isOpen={isDeleteDialogOpen}
                        onClose={() => setIsDeleteDialogOpen(false)}
                        onConfirm={() => {
                            void archive();
                        }}
                        title={t('sla.confirm_archive_title')}
                        message={t('sla.confirm_archive_message')}
                        confirmLabel={t('sla.actions.archive')}
                        cancelLabel={t('actions.cancel')}
                        variant="danger"
                        isLoading={isDeleting}
                    />
                </div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
