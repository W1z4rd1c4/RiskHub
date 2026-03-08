import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Calendar, Plus, Save, Trash2, User as UserIcon, X } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
    VendorActionButton,
    VendorInlineMessage,
} from '@/components/vendors/vendorRouteUi';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { userApi } from '@/services/userApi';
import { vendorSlaApi } from '@/services/vendorSlaApi';
import type {
    VendorSLA,
    VendorSLACreate,
    VendorSLAFrequency,
    VendorSLAUpdate,
} from '@/types/vendorSla';

interface VendorSLAModalProps {
    vendorId: number;
    sla?: VendorSLA | null;
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => Promise<void>;
    canManage: boolean;
    canDelete: boolean;
}

export function VendorSLAModal({
    vendorId,
    sla,
    isOpen,
    onClose,
    onSaved,
    canManage,
    canDelete,
}: VendorSLAModalProps) {
    const { t } = useTranslation('vendors');
    const isCreate = !sla;
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [users, setUsers] = useState<{ id: number; name: string; email: string }[]>([]);
    const [recordValue, setRecordValue] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
        void loadUsers();
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        setError(null);
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
            return;
        }

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
    }, [isOpen, sla]);

    const ownerOptions = useMemo(
        () => users.map((user) => ({ value: String(user.id), label: `${user.name} (${user.email})` })),
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
        if (!canManage || !formData.metric_name?.trim()) return;

        try {
            setIsSaving(true);
            setError(null);
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
            setError(t('errors.save_failed'));
        } finally {
            setIsSaving(false);
        }
    };

    const archive = async () => {
        if (!sla || !canDelete) return;
        try {
            setIsDeleting(true);
            setError(null);
            await vendorSlaApi.archive(sla.id);
            await onSaved();
            onClose();
        } catch (err) {
            console.error('Failed to archive vendor SLA:', err);
            setError(t('errors.save_failed'));
        } finally {
            setIsDeleting(false);
            setIsDeleteDialogOpen(false);
        }
    };

    const restore = async () => {
        if (!sla || !canDelete) return;
        try {
            setIsDeleting(true);
            setError(null);
            await vendorSlaApi.restore(sla.id);
            await onSaved();
            onClose();
        } catch (err) {
            console.error('Failed to restore vendor SLA:', err);
            setError(t('errors.save_failed'));
        } finally {
            setIsDeleting(false);
        }
    };

    const record = async () => {
        if (!sla) return;
        try {
            setIsRecording(true);
            setError(null);
            await vendorSlaApi.recordValue(sla.id, { value: Number(recordValue) });
            await onSaved();
        } catch (err) {
            console.error('Failed to record SLA value:', err);
            setError(t('errors.save_failed'));
        } finally {
            setIsRecording(false);
        }
    };

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen ? (
                <div className="vendor-route fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="vendor-modal-backdrop absolute inset-0"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 18 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 18 }}
                        className="vendor-modal relative z-10 w-full max-w-3xl"
                    >
                        <div className="vendor-modal__header vendor-divider flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="vendor-badge vendor-badge--info">
                                    {isCreate ? <Plus className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                                </div>
                                <div>
                                    <h3 className="vendor-title text-xl font-bold">
                                        {isCreate ? t('sla.modal.create_title') : t('sla.modal.edit_title')}
                                    </h3>
                                    <p className="vendor-section-description">{t('sla.modal.subtitle')}</p>
                                </div>
                            </div>

                            <VendorActionButton onClick={onClose} variant="ghost" aria-label={t('actions.cancel')}>
                                <X className="h-4 w-4" />
                            </VendorActionButton>
                        </div>

                        <div className="vendor-modal__body space-y-6">
                            {error ? <VendorInlineMessage tone="danger">{error}</VendorInlineMessage> : null}

                            <div className="vendor-form-grid">
                                <div className="vendor-field md:col-span-2">
                                    <label className="vendor-label">{t('sla.fields.metric_name')}</label>
                                    <input
                                        type="text"
                                        value={formData.metric_name}
                                        onChange={(event) =>
                                            setFormData({ ...formData, metric_name: event.target.value })
                                        }
                                        className="vendor-input"
                                        placeholder={t('sla.fields.metric_name_placeholder')}
                                    />
                                </div>

                                <div className="vendor-field md:col-span-2">
                                    <label className="vendor-label">{t('sla.fields.description')}</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(event) =>
                                            setFormData({ ...formData, description: event.target.value })
                                        }
                                        rows={3}
                                        className="vendor-textarea"
                                        placeholder={t('sla.fields.description_placeholder')}
                                    />
                                </div>

                                <div className="vendor-field">
                                    <label className="vendor-label">
                                        {isCreate ? t('sla.fields.current_value') : t('sla.fields.current_value_edit_hint')}
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.current_value}
                                        onChange={(event) =>
                                            setFormData({
                                                ...formData,
                                                current_value: Number(event.target.value),
                                            })
                                        }
                                        disabled={!isCreate}
                                        className="vendor-input font-mono"
                                    />
                                </div>

                                <div className="vendor-field">
                                    <label className="vendor-label">{t('sla.fields.unit')}</label>
                                    <input
                                        type="text"
                                        value={formData.unit}
                                        onChange={(event) =>
                                            setFormData({ ...formData, unit: event.target.value })
                                        }
                                        className="vendor-input"
                                        placeholder="%"
                                    />
                                </div>

                                <div className="vendor-field">
                                    <label className="vendor-label">{t('sla.fields.lower_limit')}</label>
                                    <input
                                        type="number"
                                        value={formData.lower_limit}
                                        onChange={(event) =>
                                            setFormData({
                                                ...formData,
                                                lower_limit: Number(event.target.value),
                                            })
                                        }
                                        className="vendor-input font-mono"
                                    />
                                </div>

                                <div className="vendor-field">
                                    <label className="vendor-label">{t('sla.fields.upper_limit')}</label>
                                    <input
                                        type="number"
                                        value={formData.upper_limit}
                                        onChange={(event) =>
                                            setFormData({
                                                ...formData,
                                                upper_limit: Number(event.target.value),
                                            })
                                        }
                                        className="vendor-input font-mono"
                                    />
                                </div>

                                <div className="vendor-field">
                                    <label className="vendor-label flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {t('sla.fields.frequency')}
                                    </label>
                                    <ThemedSelect
                                        value={formData.frequency || 'monthly'}
                                        onValueChange={(value) =>
                                            setFormData({ ...formData, frequency: value as VendorSLAFrequency })
                                        }
                                        options={frequencyOptions}
                                    />
                                </div>

                                <div className="vendor-field">
                                    <label className="vendor-label flex items-center gap-1">
                                        <UserIcon className="h-3 w-3" />
                                        {t('sla.fields.reporting_owner')}
                                    </label>
                                    <ThemedSelect
                                        value={formData.reporting_owner_id ? String(formData.reporting_owner_id) : ''}
                                        onValueChange={(value) =>
                                            setFormData({
                                                ...formData,
                                                reporting_owner_id: value ? Number(value) : undefined,
                                            })
                                        }
                                        options={ownerOptions}
                                        allowEmpty
                                        emptyLabel={t('sla.owner.unassigned')}
                                    />
                                </div>
                            </div>

                            {!isCreate && sla ? (
                                <div className="vendor-card space-y-4">
                                    <div>
                                        <h4 className="vendor-section-title">{t('sla.record.title')}</h4>
                                        <p className="vendor-section-description">
                                            {t('sla.fields.current_value_edit_hint')}
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-3 md:flex-row">
                                        <input
                                            type="number"
                                            value={recordValue}
                                            onChange={(event) => setRecordValue(Number(event.target.value))}
                                            className="vendor-input flex-1 font-mono"
                                        />
                                        <VendorActionButton
                                            onClick={record}
                                            disabled={isRecording || Boolean(sla.is_archived)}
                                        >
                                            {isRecording ? t('sla.record.saving') : t('sla.record.save')}
                                        </VendorActionButton>
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="vendor-modal__footer vendor-divider flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                {!isCreate && sla && canDelete ? (
                                    sla.is_archived ? (
                                        <VendorActionButton onClick={() => void restore()} disabled={isDeleting} variant="success">
                                            {t('actions.unarchive')}
                                        </VendorActionButton>
                                    ) : (
                                        <VendorActionButton
                                            onClick={() => setIsDeleteDialogOpen(true)}
                                            disabled={isDeleting}
                                            variant="danger"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            {t('sla.actions.archive')}
                                        </VendorActionButton>
                                    )
                                ) : null}
                            </div>

                            <div className="vendor-toolbar">
                                <VendorActionButton onClick={onClose}>{t('actions.cancel')}</VendorActionButton>
                                <VendorActionButton
                                    onClick={save}
                                    disabled={!canManage || isSaving || !formData.metric_name?.trim() || Boolean(sla?.is_archived)}
                                    variant="primary"
                                >
                                    <Save className="h-4 w-4" />
                                    {t('actions.save')}
                                </VendorActionButton>
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
            ) : null}
        </AnimatePresence>,
        document.body,
    );
}
