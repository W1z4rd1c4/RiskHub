import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertOctagon, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { vendorIncidentApi } from '@/services/vendorIncidentApi';
import type { VendorIncident, VendorIncidentSeverity, VendorIncidentType } from '@/types/vendorIncident';

interface VendorIncidentsTabProps {
    vendorId: number;
    canEdit: boolean;
}

function badge(text: string, className: string) {
    return <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${className}`}>{text}</span>;
}

export function VendorIncidentsTab({ vendorId, canEdit }: VendorIncidentsTabProps) {
    const { t } = useTranslation('vendors');
    const [items, setItems] = useState<VendorIncident[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [showForm, setShowForm] = useState(false);
    const [incidentType, setIncidentType] = useState<VendorIncidentType>('security');
    const [severity, setSeverity] = useState<VendorIncidentSeverity>('medium');
    const [isMajor, setIsMajor] = useState(false);
    const [summary, setSummary] = useState('');
    const [details, setDetails] = useState('');

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await vendorIncidentApi.listIncidents(vendorId);
            setItems(data);
        } catch (err) {
            console.error('Failed to load vendor incidents:', err);
        } finally {
            setIsLoading(false);
        }
    }, [vendorId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const typeOptions = useMemo(
        () => [
            { value: 'security', label: t('incidents.type.security', 'Security') },
            { value: 'operational', label: t('incidents.type.operational', 'Operational') },
            { value: 'regulatory_breach', label: t('incidents.type.regulatory_breach', 'Regulatory breach') },
            { value: 'contract_breach', label: t('incidents.type.contract_breach', 'Contract breach') },
            { value: 'other', label: t('incidents.type.other', 'Other') },
        ],
        [t],
    );

    const severityOptions = useMemo(
        () => [
            { value: 'low', label: t('incidents.severity.low', 'Low') },
            { value: 'medium', label: t('incidents.severity.medium', 'Medium') },
            { value: 'high', label: t('incidents.severity.high', 'High') },
            { value: 'critical', label: t('incidents.severity.critical', 'Critical') },
        ],
        [t],
    );

    const create = async () => {
        if (!summary.trim()) return;
        try {
            setIsSaving(true);
            await vendorIncidentApi.createIncident(vendorId, {
                incident_type: incidentType,
                severity,
                is_major: isMajor,
                summary: summary.trim(),
                details: details.trim() || null,
                occurred_at: new Date().toISOString(),
            });
            setShowForm(false);
            setSummary('');
            setDetails('');
            setIsMajor(false);
            await refresh();
        } catch (err) {
            console.error('Failed to create incident:', err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="glass-card p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <AlertOctagon className="h-4 w-4" />
                        {t('tabs.incidents', 'Incidents')}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        {t('incidents.subtitle', 'Record vendor incidents and major breaches.')}
                    </p>
                </div>

                {canEdit && (
                    <button
                        onClick={() => setShowForm((v) => !v)}
                        className="px-4 py-2 bg-accent/20 border border-accent/30 text-accent rounded-xl font-bold hover:bg-accent/30 transition-colors flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        {t('incidents.actions.add', 'Add incident')}
                    </button>
                )}
            </div>

            {showForm && canEdit && (
                <div className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                        <ThemedSelect value={incidentType} onValueChange={(v) => setIncidentType(v as VendorIncidentType)} options={typeOptions} />
                        <ThemedSelect value={severity} onValueChange={(v) => setSeverity(v as VendorIncidentSeverity)} options={severityOptions} />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-200 font-medium">
                        <input type="checkbox" checked={isMajor} onChange={(e) => setIsMajor(e.target.checked)} />
                        {t('incidents.fields.is_major', 'Major incident')}
                    </label>
                    <input
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400"
                        placeholder={t('incidents.fields.summary', 'Summary')}
                    />
                    <textarea
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        rows={3}
                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400"
                        placeholder={t('incidents.fields.details', 'Details (optional)')}
                    />
                    <div className="flex justify-end">
                        <button
                            onClick={create}
                            disabled={isSaving || !summary.trim()}
                            className="px-4 py-2 bg-accent text-white rounded-xl font-bold hover:bg-accent/90 transition-colors disabled:opacity-60 flex items-center gap-2"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {t('incidents.actions.save', 'Save')}
                        </button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center gap-3 text-slate-500 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading', 'Loading...')}
                </div>
            ) : items.length === 0 ? (
                <p className="text-sm text-slate-500 font-medium">{t('incidents.empty', 'No incidents yet.')}</p>
            ) : (
                <div className="space-y-3">
                    {items.map((i) => (
                        <div key={i.id} className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-white font-bold">{i.summary}</p>
                                <div className="flex items-center gap-2">
                                    {i.is_major && badge('MAJOR', 'text-rose-300 bg-rose-400/10 border-rose-400/20')}
                                    {badge(i.severity.toUpperCase(), 'text-slate-300 bg-white/5 border-white/10')}
                                    {canEdit && (
                                        <button
                                            onClick={async () => {
                                                if (!confirm(t('incidents.confirm_delete', 'Delete this incident?'))) return;
                                                await vendorIncidentApi.deleteIncident(i.id);
                                                await refresh();
                                            }}
                                            className="p-2 text-rose-300 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <p className="text-xs text-slate-500 font-medium">
                                {i.incident_type} · {new Date(i.created_at).toLocaleDateString()}
                            </p>
                            {i.details && <p className="text-sm text-slate-200 whitespace-pre-wrap">{i.details}</p>}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

