import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Activity, Calendar, Plus, Save, Trash2, User, X } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { KRIVendorSelector, type KRIVendorOption } from '@/components/kri/KRIVendorSelector';
import { getKriDraftValidationErrorKey } from '@/components/kri/kriFormValidation';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTranslation } from '@/i18n/hooks';
import { formatDateTimeValue } from '@/i18n/formatters';
import { ApiClientError } from '@/services/apiClient';
import { userApi } from '@/services/userApi';
import { vendorApi } from '@/services/vendorApi';
import { KRIFrequencies, type KRICreate, type KRIFrequency, type KeyRiskIndicator, type KRIUpdate } from '@/types/kri';
import { logError } from '@/services/logger';

export type KRIModalSaveResult =
    | { kind: 'updated' }
    | { kind: 'approval'; approvalId: number; message: string };

interface KRIModalProps {
    risk_id: number;
    kri?: KeyRiskIndicator | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: KRICreate | KRIUpdate, vendorIds: number[]) => Promise<KRIModalSaveResult>;
    onDelete?: (id: number) => Promise<void>;
}

function mergeVendorOptions(
    current: KRIVendorOption[],
    incoming: KRIVendorOption[],
): KRIVendorOption[] {
    const merged = new Map<number, KRIVendorOption>();
    for (const vendor of current) {
        merged.set(vendor.id, vendor);
    }
    for (const vendor of incoming) {
        merged.set(vendor.id, vendor);
    }
    return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function KRIModal({ risk_id, kri, isOpen, onClose, onSave, onDelete }: KRIModalProps) {
    const { t, i18n } = useTranslation(['kris', 'common', 'errorKeys']);
    const isCreate = !kri;
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [vendorSearch, setVendorSearch] = useState('');
    const debouncedVendorSearch = useDebouncedValue(vendorSearch, 300);
    const [isLoadingVendors, setIsLoadingVendors] = useState(false);
    const [vendorOptions, setVendorOptions] = useState<KRIVendorOption[]>([]);
    const [selectedVendorIds, setSelectedVendorIds] = useState<number[]>([]);
    const [selectedVendorOptions, setSelectedVendorOptions] = useState<KRIVendorOption[]>([]);

    const [formData, setFormData] = useState<Partial<KRICreate & KRIUpdate>>({
        metric_name: '',
        description: '',
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
                description: kri.description,
                current_value: kri.current_value,
                lower_limit: kri.lower_limit,
                upper_limit: kri.upper_limit,
                unit: kri.unit,
                frequency: kri.frequency || 'quarterly',
                reporting_owner_id: kri.reporting_owner_id ?? undefined,
            });
            const linkedVendorOptions = (kri.linked_vendors ?? []).map((vendor) => ({
                id: vendor.id,
                name: vendor.name,
            }));
            setSelectedVendorIds(linkedVendorOptions.map((vendor) => vendor.id));
            setSelectedVendorOptions(linkedVendorOptions);
        } else {
            setFormData({
                metric_name: '',
                description: '',
                current_value: 0,
                lower_limit: 0,
                upper_limit: 100,
                unit: '%',
                frequency: 'quarterly',
                reporting_owner_id: undefined,
            });
            setSelectedVendorIds([]);
            setSelectedVendorOptions([]);
        }
        setVendorSearch('');
        setError(null);
    }, [kri, isOpen]);

    useEffect(() => {
        const loadUsers = async () => {
            try {
                const userList = await userApi.listVisibleUsers();
                setUsers(userList);
            } catch (err) {
                logError('Error loading users:', err);
            }
        };
        void loadUsers();
    }, []);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const loadVendors = async () => {
            try {
                setIsLoadingVendors(true);
                const response = await vendorApi.getVendors({
                    offset: 0,
                    limit: 25,
                    include_archived: true,
                    search: debouncedVendorSearch.trim() || undefined,
                });
                setVendorOptions(
                    response.items.map((vendor) => ({
                        id: vendor.id,
                        name: vendor.name,
                        status: vendor.status,
                    })),
                );
            } catch (err) {
                logError('Error loading vendors for KRI modal:', err);
            } finally {
                setIsLoadingVendors(false);
            }
        };
        void loadVendors();
    }, [debouncedVendorSearch, isOpen]);

    useEffect(() => {
        if (vendorOptions.length === 0) {
            return;
        }
        setSelectedVendorOptions((current) => mergeVendorOptions(current, vendorOptions));
    }, [vendorOptions]);

    const validationErrorKey = useMemo(
        () => getKriDraftValidationErrorKey(formData),
        [formData],
    );

    const handleSelectedVendorIdsChange = (vendorIds: number[]) => {
        setSelectedVendorIds(vendorIds);
        setSelectedVendorOptions((current) =>
            mergeVendorOptions(
                current.filter((vendor) => vendorIds.includes(vendor.id)),
                vendorOptions.filter((vendor) => vendorIds.includes(vendor.id)),
            ),
        );
        setError(null);
    };

    if (!isOpen) return null;

    const handleSave = async () => {
        const validationError = getKriDraftValidationErrorKey(formData);
        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setIsSaving(true);
            setError(null);
            const { current_value: _currentValue, ...rest } = formData;
            const data = isCreate ? { ...formData, risk_id } as KRICreate : rest as KRIUpdate;
            await onSave(data, selectedVendorIds);
            onClose();
        } catch (err) {
            logError('Save failed:', err);
            if (err instanceof ApiClientError) {
                setError(err.rawMessage ?? err.messageKey);
                return;
            }
            if (err instanceof Error) {
                setError(err.message);
                return;
            }
            setError('errorKeys.save_kri_failed');
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
            logError('Delete failed:', err);
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
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-accent/10 rounded-lg">
                                    {isCreate ? (
                                        <Plus className="h-5 w-5 text-accent" />
                                    ) : (
                                        <Activity className="h-5 w-5 text-accent" />
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">
                                        {isCreate ? t('create_kri', { ns: 'kris' }) : t('edit_kri', { ns: 'kris' })}
                                    </h3>
                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                                        {t('modal.framework', { ns: 'kris' })}
                                    </p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            {error ? (
                                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 flex items-start gap-3">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>
                                        {error.startsWith('errorKeys.') || error.startsWith('kris:')
                                            ? t(error, { ns: error.startsWith('kris:') ? 'kris' : 'errorKeys' })
                                            : error}
                                    </span>
                                </div>
                            ) : null}

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                    {t('modal.metric_name', { ns: 'kris' })}
                                </label>
                                <input
                                    type="text"
                                    placeholder={t('form.placeholders.metric_name')}
                                    value={formData.metric_name}
                                    onChange={(e) => {
                                        setFormData({ ...formData, metric_name: e.target.value });
                                        setError(null);
                                    }}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all font-medium"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                    {t('fields.description', { ns: 'kris' })}
                                </label>
                                <textarea
                                    rows={3}
                                    value={formData.description}
                                    onChange={(e) => {
                                        setFormData({ ...formData, description: e.target.value });
                                        setError(null);
                                    }}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all resize-none"
                                    placeholder={t('form.placeholders.description', { ns: 'kris' })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                        {isCreate
                                            ? t('fields.current_value', { ns: 'kris' })
                                            : t('modal.current_value_readonly', { ns: 'kris' })}
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.current_value}
                                        onChange={(e) =>
                                            setFormData({ ...formData, current_value: parseFloat(e.target.value) })
                                        }
                                        disabled={!isCreate}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                        {t('modal.unit_examples', { ns: 'kris' })}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.unit}
                                        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-rose-500/50 ml-1">
                                        {t('modal.lower_limit_breach', { ns: 'kris' })}
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.lower_limit}
                                        onChange={(e) =>
                                            setFormData({ ...formData, lower_limit: parseFloat(e.target.value) })
                                        }
                                        className="w-full bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3 text-white outline-none focus:border-rose-500/50 transition-all font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-rose-500/50 ml-1">
                                        {t('modal.upper_limit_breach', { ns: 'kris' })}
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.upper_limit}
                                        onChange={(e) =>
                                            setFormData({ ...formData, upper_limit: parseFloat(e.target.value) })
                                        }
                                        className="w-full bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3 text-white outline-none focus:border-rose-500/50 transition-all font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {t('fields.frequency', { ns: 'kris' })}
                                    </label>
                                    <ThemedSelect
                                        value={formData.frequency || 'quarterly'}
                                        onValueChange={(value) => {
                                            if ((KRIFrequencies as readonly string[]).includes(value)) {
                                                setFormData({ ...formData, frequency: value as KRIFrequency });
                                            }
                                        }}
                                        className="w-full"
                                        options={[
                                            { value: 'daily', label: t('frequencies.daily', { ns: 'kris' }) },
                                            { value: 'weekly', label: t('frequencies.weekly', { ns: 'kris' }) },
                                            { value: 'monthly', label: t('frequencies.monthly', { ns: 'kris' }) },
                                            { value: 'quarterly', label: t('frequencies.quarterly', { ns: 'kris' }) },
                                            { value: 'annually', label: t('frequencies.annually', { ns: 'kris' }) },
                                        ]}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        {t('fields.owner', { ns: 'kris' })}
                                    </label>
                                    <ThemedSelect
                                        value={formData.reporting_owner_id?.toString() ?? ''}
                                        onValueChange={(value) =>
                                            setFormData({
                                                ...formData,
                                                reporting_owner_id: value ? parseInt(value, 10) : undefined,
                                            })
                                        }
                                        placeholder={t('form.placeholders.reporting_owner_default')}
                                        allowEmpty
                                        emptyLabel={t('form.placeholders.reporting_owner_default')}
                                        className="w-full"
                                        options={users.map((user) => ({ value: user.id.toString(), label: user.name }))}
                                    />
                                </div>
                            </div>

                            <div className="pt-6 border-t border-white/5">
                                <KRIVendorSelector
                                    vendors={vendorOptions}
                                    selectedVendorIds={selectedVendorIds}
                                    selectedVendorOptions={selectedVendorOptions}
                                    onChange={handleSelectedVendorIdsChange}
                                    isLoading={isLoadingVendors}
                                    search={vendorSearch}
                                    onSearchChange={setVendorSearch}
                                    emptyStateLabel={
                                        debouncedVendorSearch.trim().length > 0
                                            ? t('kris:vendor_assignment.empty_search')
                                            : t('kris:vendor_assignment.empty')
                                    }
                                />
                            </div>

                            {!isCreate && kri ? (
                                <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl text-[10px] text-slate-500 font-bold">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {t('modal.last_updated', { ns: 'kris' })}:{' '}
                                    {formatDateTimeValue(kri.last_updated, i18n.language)}
                                </div>
                            ) : null}
                        </div>

                        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                            <div>
                                {!isCreate && onDelete ? (
                                    <button
                                        onClick={() => setIsDeleteDialogOpen(true)}
                                        disabled={isDeleting}
                                        className="p-3 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                                        title={t('delete_kri', { ns: 'kris' })}
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </button>
                                ) : null}
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                                >
                                    {t('actions.cancel', { ns: 'common' })}
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving || validationErrorKey !== null}
                                    className="px-8 py-2.5 bg-accent rounded-xl text-slate-950 text-xs font-black uppercase tracking-widest hover:shadow-lg hover:shadow-accent/35 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isSaving ? (
                                        t('loading.generic', { ns: 'common' })
                                    ) : (
                                        <>
                                            <Save className="h-4 w-4" />
                                            {isCreate
                                                ? t('modal.create_indicator', { ns: 'kris' })
                                                : t('actions.save', { ns: 'common' })}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body,
    );

    return (
        <>
            {mainModal}
            <ConfirmDialog
                isOpen={isDeleteDialogOpen}
                onClose={() => setIsDeleteDialogOpen(false)}
                onConfirm={handleDelete}
                title={t('delete_kri', { ns: 'kris' })}
                message={t('modal.delete_confirm', { ns: 'kris', name: kri?.metric_name || '' })}
                confirmLabel={t('actions.delete', { ns: 'common' })}
                variant="danger"
                isLoading={isDeleting}
            />
        </>
    );
}
