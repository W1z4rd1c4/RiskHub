import { Clock3, RotateCcw } from 'lucide-react';

import { GovernedMutationDiff } from '@/components/approvals/GovernedMutationDiff';
import { formatDateValue, formatTimeValue } from '@/i18n/formatters';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { AssetPendingChangeRead } from '@/types/asset';
import type { GovernedDerivedImpact } from '@/types/approval';

interface AssetPendingChangePanelProps {
    pendingChange: AssetPendingChangeRead;
    locale?: string;
    cancelling?: boolean;
    onCancel?: () => void;
}

export function AssetPendingChangePanel({
    pendingChange,
    locale = 'en',
    cancelling = false,
    onCancel,
}: AssetPendingChangePanelProps) {
    const { t } = useTranslation('assets');
    const canCancel = resolveCapabilityFlag(pendingChange.capabilities, 'can_cancel') && onCancel !== undefined;
    const canViewDiff = resolveCapabilityFlag(pendingChange.capabilities, 'can_view_diff');

    return (
        <section
            className="glass-card space-y-5 border border-amber-400/30"
            data-testid="asset-pending-change"
            aria-labelledby="asset-pending-change-title"
        >
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 id="asset-pending-change-title" className="text-sm font-black uppercase tracking-widest text-amber-200">
                            {t('pending_change.title')}
                        </h2>
                        <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-200">
                            {t('pending_change.badge')}
                        </span>
                    </div>
                    {canViewDiff ? (
                        <>
                            <p className="mt-2 text-sm text-slate-300">{pendingChange.reason}</p>
                            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                                {t('pending_change.requested_by_at', {
                                    requester: pendingChange.requested_by_name ?? t('pending_change.unknown_requester'),
                                    date: formatDateValue(pendingChange.requested_at, locale),
                                    time: formatTimeValue(pendingChange.requested_at, locale),
                                })}
                            </p>
                        </>
                    ) : null}
                </div>
                {canCancel ? (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={cancelling}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-300/30 px-4 py-2 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-300/10 disabled:opacity-50"
                    >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        {t('pending_change.cancel')}
                    </button>
                ) : null}
            </div>
            {canViewDiff ? (
                <GovernedMutationDiff
                    before={pendingChange.before}
                    after={pendingChange.after}
                    derivedImpact={pendingChange.derived_impact as GovernedDerivedImpact}
                    impactedResources={pendingChange.impacted_resources}
                    relationshipChange={pendingChange.relationship_change}
                    mutationKind={pendingChange.mutation_kind}
                    testId="asset-pending-change-diff"
                />
            ) : <p className="text-sm text-slate-500">{t('pending_change.diff_restricted')}</p>}
        </section>
    );
}
