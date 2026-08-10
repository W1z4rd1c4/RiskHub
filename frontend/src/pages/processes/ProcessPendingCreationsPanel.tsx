import { Clock, RotateCcw } from 'lucide-react';

import { formatDateValue, formatTimeValue } from '@/i18n/formatters';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { ProcessPendingCreationRead } from '@/types/process';
import type { ApprovalQueueTab } from '@/pages/approvals/approvalNavigation';

interface ProcessPendingCreationsPanelProps {
    items: ProcessPendingCreationRead[];
    cancellingApprovalId: number | null;
    onCancel: (approvalId: number) => void;
    onOpenRequest: (approvalId: number, tab: ApprovalQueueTab) => void;
}

function safeLabel(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() && !/^#?\d+$/.test(value.trim())
        ? value.trim()
        : fallback;
}

export function ProcessPendingCreationsPanel({
    items,
    cancellingApprovalId,
    onCancel,
    onOpenRequest,
}: ProcessPendingCreationsPanelProps) {
    const { t, i18n } = useTranslation('processes');
    if (items.length === 0) return null;

    return (
        <section
            aria-labelledby="process-pending-creations-heading"
            className="glass-card space-y-4 border border-amber-400/20"
            data-testid="process-pending-creations"
        >
            <div>
                <h2 id="process-pending-creations-heading" className="text-sm font-black uppercase tracking-widest text-amber-200">
                    {t('pending_creation.title')}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{t('pending_creation.description')}</p>
            </div>
            <ul className="space-y-3">
                {items.map((item) => (
                    <li key={item.approval_id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-200">
                                        {t('pending_creation.badge')}
                                    </span>
                                    {resolveCapabilityFlag(item.capabilities, 'can_view_diff') ? (
                                        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                                            {t('derived.cif')}: {t(`values.cif_override.${item.derived.cif}`)}
                                        </span>
                                    ) : null}
                                </div>
                                {resolveCapabilityFlag(item.capabilities, 'can_view_diff') ? (
                                    <>
                                        <h3 className="text-base font-bold text-white">
                                            {safeLabel(item.proposed.l1_process, t('pending_creation.unnamed'))}
                                        </h3>
                                        <dl className="grid grid-cols-1 gap-2 text-xs text-slate-400 sm:grid-cols-2">
                                            <div>
                                                <dt className="font-bold uppercase tracking-wider text-slate-600">{t('form.owner')}</dt>
                                                <dd>{safeLabel(item.proposed.process_owner, t('ownership_display.unknown_user'))}</dd>
                                            </div>
                                            <div>
                                                <dt className="font-bold uppercase tracking-wider text-slate-600">{t('form.owner_department')}</dt>
                                                <dd>{safeLabel(item.proposed.owning_department, t('ownership_display.unknown_department'))}</dd>
                                            </div>
                                        </dl>
                                        <p className="text-sm text-slate-400">{item.reason}</p>
                                        <p className="flex items-center gap-1 text-xs text-slate-500">
                                            <Clock className="h-3 w-3" aria-hidden="true" />
                                            {t('pending_creation.requested_by_at', {
                                                requester: item.requested_by_name ?? t('pending_change.unknown_requester'),
                                                date: formatDateValue(item.requested_at, i18n.language),
                                                time: formatTimeValue(item.requested_at, i18n.language),
                                            })}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-xs text-slate-500">{t('pending_change.diff_restricted')}</p>
                                )}
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <button
                                    type="button"
                                    onClick={() => onOpenRequest(
                                        item.approval_id,
                                        resolveCapabilityFlag(item.capabilities, 'is_requester')
                                            ? 'mine'
                                            : resolveCapabilityFlag(item.capabilities, 'can_resolve')
                                                ? 'pending'
                                                : 'mine',
                                    )}
                                    className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5 hover:text-white"
                                >
                                    {t('pending_creation.open_request')}
                                </button>
                                {resolveCapabilityFlag(item.capabilities, 'can_cancel') ? (
                                    <button
                                        type="button"
                                        disabled={cancellingApprovalId === item.approval_id}
                                        onClick={() => onCancel(item.approval_id)}
                                        className="rounded-xl border border-rose-400/20 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-400/10 disabled:opacity-50"
                                    >
                                        <span className="flex items-center gap-1.5">
                                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                            {t('pending_change.cancel')}
                                        </span>
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
