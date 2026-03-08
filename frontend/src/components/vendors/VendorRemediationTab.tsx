import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { CheckCircle2, ClipboardCheck, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { vendorIncidentApi } from '@/services/vendorIncidentApi';
import type { VendorRemediationAction, VendorRemediationStatus } from '@/types/vendorIncident';
import {
    VendorActionButton,
    VendorEmptyState,
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface VendorRemediationTabProps {
    vendorId: number;
    canEdit: boolean; // owner or vendors:write
}

export function VendorRemediationTab({ vendorId, canEdit }: VendorRemediationTabProps) {
    const { t } = useTranslation('vendors');
    const [items, setItems] = useState<VendorRemediationAction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [showForm, setShowForm] = useState(false);
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<VendorRemediationStatus>('open');
    const [deleteActionId, setDeleteActionId] = useState<number | null>(null);

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await vendorIncidentApi.listRemediation(vendorId);
            setItems(data);
        } catch (err) {
            console.error('Failed to load remediation:', err);
        } finally {
            setIsLoading(false);
        }
    }, [vendorId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const statusOptions = useMemo(
        () => [
            { value: 'open', label: t('remediation.status.open') },
            { value: 'in_progress', label: t('remediation.status.in_progress') },
            { value: 'done', label: t('remediation.status.done') },
        ],
        [t],
    );

    const create = async () => {
        if (!description.trim()) return;
        try {
            setIsSaving(true);
            await vendorIncidentApi.createRemediation(vendorId, {
                description: description.trim(),
                status,
            });
            setDescription('');
            setStatus('open');
            setShowForm(false);
            await refresh();
        } catch (err) {
            console.error('Failed to create remediation:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (deleteActionId === null) return;
        try {
            await vendorIncidentApi.deleteRemediation(deleteActionId);
            await refresh();
        } catch (err) {
            console.error('Failed to delete remediation:', err);
        } finally {
            setDeleteActionId(null);
        }
    };

    return (
        <VendorSurface className="space-y-6">
            <VendorSectionHeader
                icon={<ClipboardCheck className="h-4 w-4" />}
                title={t('tabs.remediation')}
                description={t('remediation.subtitle')}
                actions={canEdit ? (
                    <VendorActionButton variant="primary" onClick={() => setShowForm((value) => !value)}>
                        <Plus className="h-4 w-4" />
                        {t('remediation.actions.add')}
                    </VendorActionButton>
                ) : null}
            />

            {showForm && canEdit && (
                <div className="vendor-card space-y-3">
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400"
                        placeholder={t('remediation.fields.description')}
                    />
                    <ThemedSelect value={status} onValueChange={(v) => setStatus(v as VendorRemediationStatus)} options={statusOptions} />
                    <div className="flex justify-end">
                        <VendorActionButton onClick={create} disabled={isSaving || !description.trim()} variant="primary">
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {t('remediation.actions.save')}
                        </VendorActionButton>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center gap-3 vendor-muted font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : items.length === 0 ? (
                <VendorEmptyState title={t('remediation.empty')} icon={<ClipboardCheck className="h-8 w-8" />} />
            ) : (
                <div className="space-y-3">
                    {items.map((a) => (
                        <div key={a.id} className="vendor-card space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <p className="text-sm text-white font-bold">{a.description}</p>
                                    <p className="text-xs text-slate-500 font-medium">
                                        {t(`remediation.status.${a.status}`, a.status)} · {new Date(a.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {canEdit && (
                                        <>
                                            <ThemedSelect
                                                value={a.status}
                                                onValueChange={async (v) => {
                                                    await vendorIncidentApi.updateRemediation(a.id, { status: v as VendorRemediationStatus });
                                                    await refresh();
                                                }}
                                                options={statusOptions}
                                            />
                                            <button
                                                onClick={() => setDeleteActionId(a.id)}
                                                className="p-2 text-rose-300 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </>
                                    )}
                                    {!canEdit && a.status === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <ConfirmDialog
                isOpen={deleteActionId !== null}
                onClose={() => setDeleteActionId(null)}
                onConfirm={handleConfirmDelete}
                title={t('common:actions.delete')}
                message={t('remediation.confirm_delete')}
                confirmLabel={t('common:actions.delete')}
                variant="danger"
            />
        </VendorSurface>
    );
}
