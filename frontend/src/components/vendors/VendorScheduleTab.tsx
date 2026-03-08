import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { CalendarClock, Loader2, Play, Zap } from 'lucide-react';
import {
    VendorActionButton,
    VendorInlineMessage,
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';
import { vendorApi } from '@/services/vendorApi';
import { vendorAssessmentApi } from '@/services/vendorAssessmentApi';
import type { Vendor } from '@/types/vendor';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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
    const [isTriggerDialogOpen, setIsTriggerDialogOpen] = useState(false);

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

    const trigger = async (reasonInput?: string) => {
        if (!vendor) return;
        const reason = reasonInput?.trim();
        if (!reason) return;
        try {
            setIsSaving(true);
            await vendorApi.triggerReassessment(vendor.id, reason);
            await refresh();
        } catch (err) {
            console.error('Failed to trigger reassessment:', err);
        } finally {
            setIsSaving(false);
            setIsTriggerDialogOpen(false);
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
        <VendorSurface className="space-y-6">
            <VendorSectionHeader
                icon={<CalendarClock className="h-4 w-4" />}
                title={t('tabs.schedule')}
                description={t('schedule.subtitle')}
                actions={canEdit ? (
                    <>
                        <VendorActionButton onClick={startReassessment} disabled={isSaving} variant="primary">
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            {t('schedule.actions.start_reassessment')}
                        </VendorActionButton>
                        <VendorActionButton onClick={() => setIsTriggerDialogOpen(true)} disabled={isSaving}>
                            <Zap className="h-4 w-4" />
                            {t('schedule.actions.trigger')}
                        </VendorActionButton>
                    </>
                ) : null}
            />

            {isLoading ? (
                <div className="flex items-center gap-3 vendor-muted font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : error ? (
                <VendorInlineMessage tone="danger">{error}</VendorInlineMessage>
            ) : !vendor ? (
                <VendorInlineMessage>{t('common:fallbacks.not_available')}</VendorInlineMessage>
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
            <ConfirmDialog
                isOpen={isTriggerDialogOpen}
                onClose={() => setIsTriggerDialogOpen(false)}
                onConfirm={trigger}
                title={t('schedule.trigger_dialog.title')}
                message={t('schedule.trigger_dialog.message')}
                confirmLabel={t('schedule.actions.trigger')}
                variant="warning"
                isLoading={isSaving}
                showInput
                inputLabel={t('schedule.trigger_dialog.reason_label')}
                inputPlaceholder={t('schedule.trigger_dialog.reason_placeholder')}
                inputRequired
            />
        </VendorSurface>
    );
}
