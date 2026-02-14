import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { CalendarClock, Loader2, Play, Zap } from 'lucide-react';
import { vendorApi } from '@/services/vendorApi';
import { vendorAssessmentApi } from '@/services/vendorAssessmentApi';
import type { Vendor } from '@/types/vendor';

interface VendorScheduleTabProps {
    vendorId: number;
    canEdit: boolean; // owner or vendors:write
}

function formatDate(value?: string | null): string {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleDateString();
    } catch {
        return value;
    }
}

export function VendorScheduleTab({ vendorId, canEdit }: VendorScheduleTabProps) {
    const { t } = useTranslation('vendors');
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await vendorApi.getVendor(vendorId);
            setVendor(data);
            setError(null);
        } catch (err) {
            console.error('Failed to load vendor schedule:', err);
            setError(t('errors.load_failed'));
        } finally {
            setIsLoading(false);
        }
    }, [t, vendorId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const scheduleStatus = useMemo(() => {
        const due = vendor?.next_reassessment_due_at ? new Date(vendor.next_reassessment_due_at) : null;
        if (!due) return 'unknown';
        const now = new Date();
        const ms = due.getTime() - now.getTime();
        const days = ms / (1000 * 60 * 60 * 24);
        if (days < 0) return 'overdue';
        if (days <= 30) return 'due_soon';
        return 'ok';
    }, [vendor?.next_reassessment_due_at]);

    const trigger = async () => {
        if (!vendor) return;
        const reason = prompt(t('schedule.trigger_reason_prompt'))?.trim();
        if (!reason) return;
        try {
            setIsSaving(true);
            await vendorApi.triggerReassessment(vendor.id, reason);
            await refresh();
        } catch (err) {
            console.error('Failed to trigger reassessment:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const startReassessment = async () => {
        if (!vendor) return;
        try {
            setIsSaving(true);
            await vendorAssessmentApi.createVendorAssessment(vendor.id);
            await refresh();
        } catch (err) {
            console.error('Failed to start reassessment:', err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="glass-card p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <CalendarClock className="h-4 w-4" />
                        {t('tabs.schedule')}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        {t('schedule.subtitle')}
                    </p>
                </div>

                {canEdit && (
                    <div className="flex gap-2">
                        <button
                            onClick={startReassessment}
                            disabled={isSaving}
                            className="px-4 py-2 bg-accent/20 border border-accent/30 text-accent rounded-xl font-bold hover:bg-accent/30 transition-colors flex items-center gap-2 disabled:opacity-60"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            {t('schedule.actions.start_reassessment')}
                        </button>
                        <button
                            onClick={trigger}
                            disabled={isSaving}
                            className="px-4 py-2 bg-amber-500/20 border border-amber-500/30 text-amber-200 rounded-xl font-bold hover:bg-amber-500/30 transition-colors flex items-center gap-2 disabled:opacity-60"
                        >
                            <Zap className="h-4 w-4" />
                            {t('schedule.actions.trigger')}
                        </button>
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center gap-3 text-slate-500 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : error ? (
                <div className="text-rose-400 font-medium">{error}</div>
            ) : !vendor ? (
                <div className="text-slate-500 font-medium">—</div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            {t('schedule.fields.next_due')}
                        </p>
                        <p className="text-lg text-white font-bold">{formatDate(vendor.next_reassessment_due_at)}</p>
                        <p className="text-xs text-slate-500 font-medium">
                            {t('schedule.fields.cadence')}: {vendor.reassessment_cadence_months} {t('schedule.months')}
                        </p>
                    </div>

                    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            {t('schedule.fields.status')}
                        </p>
                        <p className="text-lg text-white font-bold">
                            {scheduleStatus === 'ok' && t('schedule.status.ok')}
                            {scheduleStatus === 'due_soon' && t('schedule.status.due_soon')}
                            {scheduleStatus === 'overdue' && t('schedule.status.overdue')}
                            {scheduleStatus === 'unknown' && t('schedule.status.unknown')}
                        </p>
                        <p className="text-xs text-slate-500 font-medium">
                            {t('schedule.fields.last_decided')}: {formatDate(vendor.last_decided_at)}
                        </p>
                    </div>
                </div>
            )}
        </section>
    );
}
