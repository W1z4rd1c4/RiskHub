import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { CheckCircle2, ClipboardCheck, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { vendorIncidentApi } from '@/services/vendorIncidentApi';
import type { VendorRemediationAction, VendorRemediationStatus } from '@/types/vendorIncident';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

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

    return (
        <section className="glass-card p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4" />
                        {t('tabs.remediation')}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        {t('remediation.subtitle')}
                    </p>
                </div>
                {canEdit && (
                    <button
                        onClick={() => setShowForm((v) => !v)}
                        className="px-4 py-2 bg-accent/20 border border-accent/30 text-accent rounded-xl font-bold hover:bg-accent/30 transition-colors flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        {t('remediation.actions.add')}
                    </button>
                )}
            </div>

            {showForm && canEdit && (
                <div className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-3">
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400"
                        placeholder={t('remediation.fields.description')}
                    />
                    <ThemedSelect value={status} onValueChange={(v) => setStatus(v as VendorRemediationStatus)} options={statusOptions} />
                    <div className="flex justify-end">
                        <button
                            onClick={create}
                            disabled={isSaving || !description.trim()}
                            className="px-4 py-2 bg-accent text-white rounded-xl font-bold hover:bg-accent/90 transition-colors disabled:opacity-60 flex items-center gap-2"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {t('remediation.actions.save')}
                        </button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center gap-3 text-slate-500 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : items.length === 0 ? (
                <p className="text-sm text-slate-500 font-medium">{t('remediation.empty')}</p>
            ) : (
                <div className="space-y-3">
                    {items.map((a) => (
                        <div key={a.id} className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-2">
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
                                                onClick={async () => {
                                                    if (!confirm(t('remediation.confirm_delete'))) return;
                                                    await vendorIncidentApi.deleteRemediation(a.id);
                                                    await refresh();
                                                }}
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
        </section>
    );
}
