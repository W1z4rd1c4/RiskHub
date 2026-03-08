import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { CheckSquare, Loader2, Save } from 'lucide-react';
import {
    VendorActionButton,
    VendorInlineMessage,
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';
import { vendorContractApi } from '@/services/vendorContractApi';
import type { VendorContractControlsResponse, VendorContractControlStatus, VendorContractControlUpdate } from '@/types/vendorContract';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

interface VendorContractControlsTabProps {
    vendorId: number;
    canEdit: boolean; // owner or vendor_contracts:write
}

function statusColor(status: VendorContractControlStatus): string {
    switch (status) {
        case 'met':
            return 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20';
        case 'partial':
            return 'text-amber-300 bg-amber-400/10 border-amber-400/20';
        case 'missing':
            return 'text-rose-300 bg-rose-400/10 border-rose-400/20';
        case 'n_a':
        default:
            return 'text-slate-300 bg-white/5 border-white/10';
    }
}

export function VendorContractControlsTab({ vendorId, canEdit }: VendorContractControlsTabProps) {
    const { t } = useTranslation('vendors');
    const [data, setData] = useState<VendorContractControlsResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [draft, setDraft] = useState<Record<string, VendorContractControlUpdate>>({});

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const res = await vendorContractApi.getContractControls(vendorId);
            setData(res);
            setDraft({});
        } catch (err) {
            console.error('Failed to load contract controls:', err);
        } finally {
            setIsLoading(false);
        }
    }, [vendorId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const hasChanges = useMemo(() => Object.keys(draft).length > 0, [draft]);

    const save = async () => {
        try {
            setIsSaving(true);
            await vendorContractApi.updateContractControls(vendorId, Object.values(draft));
            await refresh();
        } catch (err) {
            console.error('Failed to save contract controls:', err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <VendorSurface className="space-y-6">
            <VendorSectionHeader
                icon={<CheckSquare className="h-4 w-4" />}
                title={t('tabs.contract_controls')}
                description={t('contract_controls.subtitle')}
                actions={canEdit ? (
                    <VendorActionButton onClick={save} disabled={!hasChanges || isSaving} variant="primary">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t('contract_controls.actions.save')}
                    </VendorActionButton>
                ) : null}
            />

            {isLoading ? (
                <div className="flex items-center gap-3 vendor-muted font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : !data ? (
                <VendorInlineMessage>—</VendorInlineMessage>
            ) : (
                <div className="space-y-6">
                    {data.templates.map((template) => (
                        <div key={template.template_key} className="space-y-3">
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">
                                {t(`contract_controls.templates.${template.template_key}`, template.template_key)}
                            </h4>
                            <div className="space-y-3">
                                {template.items.map((item) => {
                                    const draftItem = draft[item.control_key];
                                    const status = draftItem?.status ?? item.status;
                                    const evidence = draftItem?.evidence_reference ?? item.evidence_reference ?? '';
                                    const notes = draftItem?.notes ?? item.notes ?? '';
                                    const disabled = !canEdit || !item.applies;

                                    return (
                                        <div key={item.control_key} className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="space-y-1">
                                                    <p className="text-sm text-white font-bold">
                                                        {t(item.title_key, item.control_key)}
                                                    </p>
                                                    {item.description_key && (
                                                        <p className="text-xs text-slate-500 font-medium">
                                                            {t(item.description_key, '')}
                                                        </p>
                                                    )}
                                                    {!item.applies && (
                                                        <p className="text-[11px] text-slate-500 font-medium">
                                                            {t('contract_controls.not_applicable')}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {canEdit ? (
                                                        <ThemedSelect
                                                            value={status}
                                                            onValueChange={(v) =>
                                                                setDraft((prev) => ({
                                                                    ...prev,
                                                                    [item.control_key]: {
                                                                        control_key: item.control_key,
                                                                        status: v as VendorContractControlStatus,
                                                                        evidence_reference: evidence || null,
                                                                        notes: notes || null,
                                                                    },
                                                                }))
                                                            }
                                                            options={[
                                                                { value: 'met', label: t('contract_controls.status.met') },
                                                                { value: 'partial', label: t('contract_controls.status.partial') },
                                                                { value: 'missing', label: t('contract_controls.status.missing') },
                                                                { value: 'n_a', label: t('contract_controls.status.n_a') },
                                                            ]}
                                                            placeholder={t('contract_controls.fields.status')}
                                                            disabled={disabled}
                                                        />
                                                    ) : (
                                                        <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${statusColor(status)}`}>
                                                            {t(`contract_controls.status.${status}`, status)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid gap-3 md:grid-cols-2">
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                        {t('contract_controls.fields.evidence')}
                                                    </p>
                                                    <input
                                                        value={evidence}
                                                        onChange={(e) =>
                                                            setDraft((prev) => ({
                                                                ...prev,
                                                                [item.control_key]: {
                                                                    control_key: item.control_key,
                                                                    status: status as VendorContractControlStatus,
                                                                    evidence_reference: e.target.value,
                                                                    notes,
                                                                },
                                                            }))
                                                        }
                                                        disabled={disabled}
                                                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium disabled:opacity-60"
                                                        placeholder="https://... or file path"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                        {t('contract_controls.fields.notes')}
                                                    </p>
                                                    <input
                                                        value={notes}
                                                        onChange={(e) =>
                                                            setDraft((prev) => ({
                                                                ...prev,
                                                                [item.control_key]: {
                                                                    control_key: item.control_key,
                                                                    status: status as VendorContractControlStatus,
                                                                    evidence_reference: evidence,
                                                                    notes: e.target.value,
                                                                },
                                                            }))
                                                        }
                                                        disabled={disabled}
                                                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium disabled:opacity-60"
                                                        placeholder={t('contract_controls.fields.notes_placeholder')}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </VendorSurface>
    );
}
