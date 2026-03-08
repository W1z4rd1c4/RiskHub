import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { AlertTriangle, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import {
    VendorActionButton,
    VendorEmptyState,
    VendorInlineMessage,
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { vendorRiskFactorApi } from '@/services/vendorRiskFactorApi';
import {
    vendorRiskCategoryKeys,
    type VendorRiskCategoryKey,
    type VendorRiskFactor,
} from '@/types/vendorRisk';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface VendorRiskFactorsTabProps {
    vendorId: number;
    canEdit: boolean;
}

export function VendorRiskFactorsTab({ vendorId, canEdit }: VendorRiskFactorsTabProps) {
    const { t } = useTranslation('vendors');
    const [factors, setFactors] = useState<VendorRiskFactor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editing, setEditing] = useState<VendorRiskFactor | null>(null);
    const [draftCategory, setDraftCategory] = useState<VendorRiskCategoryKey>(vendorRiskCategoryKeys[0]);
    const [draftDescription, setDraftDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState<number | null>(null);
    const [deleteFactorId, setDeleteFactorId] = useState<number | null>(null);

    const categoryOptions = useMemo(
        () => vendorRiskCategoryKeys.map((k) => ({ value: k, label: t(`risk_categories.${k}`, k) })),
        [t],
    );

    const grouped = useMemo(() => {
        const groups = vendorRiskCategoryKeys.reduce(
            (acc, key) => {
                acc[key] = [];
                return acc;
            },
            {} as Record<VendorRiskCategoryKey, VendorRiskFactor[]>,
        );

        for (const factor of factors) {
            groups[factor.category_key].push(factor);
        }
        return groups;
    }, [factors]);

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await vendorRiskFactorApi.getVendorRiskFactors(vendorId);
            setFactors(data);
            setError(null);
        } catch (err) {
            console.error('Failed to load vendor risk factors:', err);
            setError(t('errors.load_failed'));
        } finally {
            setIsLoading(false);
        }
    }, [t, vendorId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const openCreate = () => {
        setEditing(null);
        setDraftCategory(vendorRiskCategoryKeys[0]);
        setDraftDescription('');
        setIsFormOpen(true);
    };

    const openEdit = (factor: VendorRiskFactor) => {
        setEditing(factor);
        setDraftCategory(factor.category_key);
        setDraftDescription(factor.description);
        setIsFormOpen(true);
    };

    const closeForm = () => {
        setIsFormOpen(false);
        setEditing(null);
    };

    const handleSave = async () => {
        if (!draftDescription.trim()) return;
        try {
            setIsSaving(true);
            if (editing) {
                await vendorRiskFactorApi.updateVendorRiskFactor(editing.id, {
                    category_key: draftCategory,
                    description: draftDescription.trim(),
                });
            } else {
                await vendorRiskFactorApi.createVendorRiskFactor(vendorId, {
                    category_key: draftCategory,
                    description: draftDescription.trim(),
                });
            }
            await refresh();
            closeForm();
        } catch (err) {
            console.error('Failed to save vendor risk factor:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (factorId: number) => {
        try {
            setIsDeleting(factorId);
            await vendorRiskFactorApi.deleteVendorRiskFactor(factorId);
            await refresh();
        } catch (err) {
            console.error('Failed to delete vendor risk factor:', err);
        } finally {
            setIsDeleting(null);
            setDeleteFactorId(null);
        }
    };

    return (
        <VendorSurface className="space-y-6">
            <VendorSectionHeader
                icon={<AlertTriangle className="h-4 w-4" />}
                title={t('tabs.risk_factors')}
                description={t('risk_factors.subtitle')}
                actions={canEdit ? (
                    <VendorActionButton variant="primary" onClick={openCreate}>
                        <Plus className="h-4 w-4" />
                        {t('risk_factors.actions.add')}
                    </VendorActionButton>
                ) : null}
            />

            {isFormOpen && canEdit && (
                <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold vendor-text">
                            {editing ? t('risk_factors.actions.edit') : t('risk_factors.actions.add')}
                        </h4>
                        <button
                            onClick={closeForm}
                            className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="md:col-span-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                                {t('risk_factors.fields.category')}
                            </p>
                            <ThemedSelect
                                value={draftCategory}
                                onValueChange={(v) => setDraftCategory(v as VendorRiskCategoryKey)}
                                options={categoryOptions}
                                placeholder={t('risk_factors.fields.category')}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                                {t('risk_factors.fields.description')}
                            </p>
                            <textarea
                                value={draftDescription}
                                onChange={(e) => setDraftDescription(e.target.value)}
                                rows={3}
                                className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium"
                                placeholder={t('risk_factors.fields.description_placeholder')}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <VendorActionButton onClick={closeForm}>
                            {t('actions.cancel')}
                        </VendorActionButton>
                        <VendorActionButton onClick={handleSave} disabled={isSaving || !draftDescription.trim()} variant="primary">
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {t('risk_factors.actions.save')}
                        </VendorActionButton>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center gap-3 vendor-muted font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : error ? (
                <VendorInlineMessage tone="danger">{error}</VendorInlineMessage>
            ) : factors.length === 0 ? (
                <VendorEmptyState icon={<AlertTriangle className="h-8 w-8" />} title={t('risk_factors.empty')} />
            ) : (
                <div className="space-y-6">
                    {vendorRiskCategoryKeys
                        .filter((k) => grouped[k].length > 0)
                        .map((categoryKey) => (
                            <div key={categoryKey} className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold vendor-text">
                                        {t(`risk_categories.${categoryKey}`, categoryKey)}
                                    </h4>
                                    <span className="text-xs vendor-muted font-medium">
                                        {grouped[categoryKey].length}
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    {grouped[categoryKey].map((factor) => (
                                        <div
                                            key={factor.id}
                                            className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl flex items-start justify-between gap-4"
                                        >
                                            <p className="text-sm text-slate-200 whitespace-pre-wrap flex-1">{factor.description}</p>
                                            {canEdit && (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => openEdit(factor)}
                                                        className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteFactorId(factor.id)}
                                                        disabled={isDeleting === factor.id}
                                                        className="p-2 text-slate-500 hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
                                                    >
                                                        {isDeleting === factor.id ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-4 w-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                </div>
            )}
            <ConfirmDialog
                isOpen={deleteFactorId !== null}
                onClose={() => setDeleteFactorId(null)}
                onConfirm={() => deleteFactorId !== null && handleDelete(deleteFactorId)}
                title={t('common:actions.delete')}
                message={t('risk_factors.confirm_delete')}
                confirmLabel={t('common:actions.delete')}
                variant="danger"
                isLoading={isDeleting !== null}
            />
        </VendorSurface>
    );
}
