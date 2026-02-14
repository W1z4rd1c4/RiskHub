import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { Loader2, Save, ShieldAlert, ShieldCheck } from 'lucide-react';
import { vendorResilienceApi } from '@/services/vendorResilienceApi';
import type { VendorResilience, VendorPlanStatus } from '@/types/vendorResilience';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

interface VendorResilienceTabProps {
    vendorId: number;
    canEdit: boolean; // owner or vendors:write
}

function toDateInput(dt?: string | null): string {
    if (!dt) return '';
    try {
        return new Date(dt).toISOString().slice(0, 10);
    } catch {
        return '';
    }
}

function fromDateInput(value: string): string | null {
    if (!value) return null;
    return `${value}T00:00:00Z`;
}

export function VendorResilienceTab({ vendorId, canEdit }: VendorResilienceTabProps) {
    const { t } = useTranslation('vendors');
    const [data, setData] = useState<VendorResilience | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [exitStatus, setExitStatus] = useState<VendorPlanStatus>('not_started');
    const [exitRef, setExitRef] = useState('');
    const [exitNotes, setExitNotes] = useState('');
    const [exitReviewed, setExitReviewed] = useState('');
    const [exitTested, setExitTested] = useState('');

    const [contStatus, setContStatus] = useState<VendorPlanStatus>('not_started');
    const [contRef, setContRef] = useState('');
    const [contNotes, setContNotes] = useState('');
    const [contReviewed, setContReviewed] = useState('');
    const [contTested, setContTested] = useState('');
    const [outageHours, setOutageHours] = useState<string>('');
    const [ciaC, setCiaC] = useState(false);
    const [ciaI, setCiaI] = useState(false);
    const [ciaA, setCiaA] = useState(false);
    const [ciaAv, setCiaAv] = useState(false);

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const res = await vendorResilienceApi.getResilience(vendorId);
            setData(res);
        } catch (err) {
            console.error('Failed to load vendor resilience:', err);
        } finally {
            setIsLoading(false);
        }
    }, [vendorId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        if (!data) return;
        setExitStatus(data.exit_plan?.status ?? 'not_started');
        setExitRef(data.exit_plan?.plan_reference ?? '');
        setExitNotes(data.exit_plan?.notes ?? '');
        setExitReviewed(toDateInput(data.exit_plan?.last_reviewed_at ?? null));
        setExitTested(toDateInput(data.exit_plan?.last_tested_at ?? null));

        setContStatus(data.contingency_plan?.status ?? 'not_started');
        setContRef(data.contingency_plan?.plan_reference ?? '');
        setContNotes(data.contingency_plan?.notes ?? '');
        setContReviewed(toDateInput(data.contingency_plan?.last_reviewed_at ?? null));
        setContTested(toDateInput(data.contingency_plan?.last_tested_at ?? null));
        setOutageHours(
            data.contingency_plan?.max_tolerable_outage_hours != null
                ? String(data.contingency_plan.max_tolerable_outage_hours)
                : '',
        );
        setCiaC(Boolean(data.contingency_plan?.impact_confidentiality));
        setCiaI(Boolean(data.contingency_plan?.impact_integrity));
        setCiaA(Boolean(data.contingency_plan?.impact_authenticity));
        setCiaAv(Boolean(data.contingency_plan?.impact_availability));
    }, [data]);

    const save = async () => {
        try {
            setIsSaving(true);
            const payload = {
                exit_plan: {
                    status: exitStatus,
                    plan_reference: exitRef || null,
                    notes: exitNotes || null,
                    last_reviewed_at: fromDateInput(exitReviewed),
                    last_tested_at: fromDateInput(exitTested),
                },
                contingency_plan: {
                    max_tolerable_outage_hours: outageHours ? Number(outageHours) : null,
                    impact_confidentiality: ciaC,
                    impact_integrity: ciaI,
                    impact_authenticity: ciaA,
                    impact_availability: ciaAv,
                    status: contStatus,
                    plan_reference: contRef || null,
                    notes: contNotes || null,
                    last_reviewed_at: fromDateInput(contReviewed),
                    last_tested_at: fromDateInput(contTested),
                },
            };
            await vendorResilienceApi.updateResilience(vendorId, payload);
            await refresh();
        } catch (err) {
            console.error('Failed to save resilience:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const statusOptions = useMemo(
        () => [
            { value: 'not_started', label: t('resilience.status.not_started') },
            { value: 'in_progress', label: t('resilience.status.in_progress') },
            { value: 'complete', label: t('resilience.status.complete') },
        ],
        [t],
    );

    return (
        <section className="glass-card p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        {data?.missing_exit_plan || data?.missing_contingency_plan ? (
                            <ShieldAlert className="h-4 w-4 text-amber-300" />
                        ) : (
                            <ShieldCheck className="h-4 w-4 text-emerald-300" />
                        )}
                        {t('tabs.resilience')}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        {t('resilience.subtitle')}
                    </p>
                </div>

                {canEdit && (
                    <button
                        onClick={save}
                        disabled={isSaving}
                        className="px-4 py-2 bg-accent text-white rounded-xl font-bold hover:bg-accent/90 transition-colors disabled:opacity-60 flex items-center gap-2"
                    >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t('resilience.actions.save')}
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center gap-3 text-slate-500 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : !data ? (
                <div className="text-slate-500 font-medium">—</div>
            ) : (
                <div className="space-y-6">
                    {!data.is_required && (
                        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl text-slate-500 font-medium text-sm">
                            {t('resilience.not_required')}
                        </div>
                    )}

                    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">
                            {t('resilience.exit_plan.title')}
                        </h4>

                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('resilience.fields.status')}
                                </p>
                                <ThemedSelect
                                    value={exitStatus}
                                    onValueChange={(v) => setExitStatus(v as VendorPlanStatus)}
                                    options={statusOptions}
                                    placeholder={t('resilience.fields.status')}
                                    disabled={!canEdit}
                                />
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('resilience.fields.reference')}
                                </p>
                                <input
                                    value={exitRef}
                                    onChange={(e) => setExitRef(e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium disabled:opacity-60"
                                    placeholder="https://... or file path"
                                />
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('resilience.fields.last_reviewed')}
                                </p>
                                <input
                                    type="date"
                                    value={exitReviewed}
                                    onChange={(e) => setExitReviewed(e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white disabled:opacity-60"
                                />
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('resilience.fields.last_tested')}
                                </p>
                                <input
                                    type="date"
                                    value={exitTested}
                                    onChange={(e) => setExitTested(e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white disabled:opacity-60"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {t('resilience.fields.notes')}
                            </p>
                            <textarea
                                value={exitNotes}
                                onChange={(e) => setExitNotes(e.target.value)}
                                rows={2}
                                disabled={!canEdit}
                                className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium disabled:opacity-60"
                                placeholder={t('resilience.fields.notes_placeholder')}
                            />
                        </div>
                    </div>

                    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">
                            {t('resilience.contingency_plan.title')}
                        </h4>

                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('resilience.fields.outage_hours')}
                                </p>
                                <input
                                    value={outageHours}
                                    onChange={(e) => setOutageHours(e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white disabled:opacity-60"
                                    placeholder="24"
                                />
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('resilience.fields.status')}
                                </p>
                                <ThemedSelect
                                    value={contStatus}
                                    onValueChange={(v) => setContStatus(v as VendorPlanStatus)}
                                    options={statusOptions}
                                    placeholder={t('resilience.fields.status')}
                                    disabled={!canEdit}
                                />
                            </div>
                        </div>

                        <div className="p-3 bg-white/[0.02] border border-white/10 rounded-xl">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                                {t('resilience.fields.cia')}
                            </p>
                            <div className="grid gap-2 md:grid-cols-2">
                                <label className="flex items-center gap-2 text-sm text-slate-200 font-medium">
                                    <input type="checkbox" checked={ciaC} onChange={(e) => setCiaC(e.target.checked)} disabled={!canEdit} />
                                    {t('resilience.cia.confidentiality')}
                                </label>
                                <label className="flex items-center gap-2 text-sm text-slate-200 font-medium">
                                    <input type="checkbox" checked={ciaI} onChange={(e) => setCiaI(e.target.checked)} disabled={!canEdit} />
                                    {t('resilience.cia.integrity')}
                                </label>
                                <label className="flex items-center gap-2 text-sm text-slate-200 font-medium">
                                    <input type="checkbox" checked={ciaA} onChange={(e) => setCiaA(e.target.checked)} disabled={!canEdit} />
                                    {t('resilience.cia.authenticity')}
                                </label>
                                <label className="flex items-center gap-2 text-sm text-slate-200 font-medium">
                                    <input type="checkbox" checked={ciaAv} onChange={(e) => setCiaAv(e.target.checked)} disabled={!canEdit} />
                                    {t('resilience.cia.availability')}
                                </label>
                            </div>
                            {data.contingency_required && (
                                <p className="text-xs text-amber-300 font-bold mt-2">
                                    {t('resilience.contingency_required')}
                                </p>
                            )}
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('resilience.fields.reference')}
                                </p>
                                <input
                                    value={contRef}
                                    onChange={(e) => setContRef(e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium disabled:opacity-60"
                                    placeholder="https://... or file path"
                                />
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('resilience.fields.notes')}
                                </p>
                                <input
                                    value={contNotes}
                                    onChange={(e) => setContNotes(e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium disabled:opacity-60"
                                    placeholder={t('resilience.fields.notes_placeholder')}
                                />
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('resilience.fields.last_reviewed')}
                                </p>
                                <input
                                    type="date"
                                    value={contReviewed}
                                    onChange={(e) => setContReviewed(e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white disabled:opacity-60"
                                />
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('resilience.fields.last_tested')}
                                </p>
                                <input
                                    type="date"
                                    value={contTested}
                                    onChange={(e) => setContTested(e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white disabled:opacity-60"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
