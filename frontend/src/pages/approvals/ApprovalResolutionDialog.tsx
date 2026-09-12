import { useId, useRef } from 'react';

import type { SafeTFunction } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import { DialogShell } from '@/components/DialogShell';
import { GovernedMutationDiff } from '@/components/approvals/GovernedMutationDiff';
import { LegacyApprovalChanges } from '@/components/approvals/LegacyApprovalChanges';
import type { ApprovalRequest } from '@/types/approval';

import { canViewApprovalPendingChanges } from './approvalPendingChanges';
import { getGovernedActionLabel } from './approvalsPresentation';

interface ApprovalResolutionDialogProps {
    selectedApproval: ApprovalRequest | null;
    dialogMode: 'approve' | 'reject' | null;
    locale: string;
    resolutionNotes: string;
    errorText: string | null;
    isSubmitting: boolean;
    onClose: () => void;
    onResolve: () => void | Promise<void>;
    onResolutionNotesChange: (value: string) => void;
    t: SafeTFunction;
}

export function ApprovalResolutionDialog({
    selectedApproval,
    dialogMode,
    locale,
    resolutionNotes,
    errorText,
    isSubmitting,
    onClose,
    onResolve,
    onResolutionNotesChange,
    t,
}: ApprovalResolutionDialogProps) {
    const titleId = useId();
    const descriptionId = useId();
    const notesRef = useRef<HTMLTextAreaElement>(null);
    const resolveInFlightRef = useRef(false);

    if (!selectedApproval || !dialogMode) return null;

    const actionLabel = getGovernedActionLabel(
        selectedApproval.action_type,
        selectedApproval.governed_mutation?.mutation_kind,
    );
    const requesterLabel = selectedApproval.requested_by_name?.trim()
        || t('approvals:legacy.unknown_user');
    const reason = selectedApproval.reason.trim() || t('approvals:legacy.not_set');
    const showChanges = canViewApprovalPendingChanges(selectedApproval);
    const submitResolution = async () => {
        if (isSubmitting || resolveInFlightRef.current) return;
        resolveInFlightRef.current = true;
        try {
            await onResolve();
        } finally {
            resolveInFlightRef.current = false;
        }
    };

    return (
        <DialogShell
            isOpen
            onClose={onClose}
            titleId={titleId}
            descriptionIds={[descriptionId]}
            closeDisabled={isSubmitting}
            backdropClassName="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            contentClassName="relative max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto glass rounded-2xl shadow-2xl"
        >
                        <div className="p-6" aria-busy={isSubmitting}>
                            <h3 id={titleId} className="text-xl font-bold text-white mb-2">
                                {dialogMode === 'approve'
                                    ? t('dialogs.approve_title')
                                    : t('dialogs.reject_title')}
                            </h3>
                            <p id={descriptionId} className="mb-4 text-sm text-slate-400">{t('dialogs.resolution_required')}</p>

                            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
                                <div className="col-span-2">
                                    <dt className="text-xs font-bold uppercase text-muted-foreground">
                                        {t('approvals:fields.entity_name')}
                                    </dt>
                                    <dd className="mt-1 break-words font-bold text-foreground">
                                        {selectedApproval.resource_name}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-bold uppercase text-muted-foreground">
                                        {t('approvals:fields.request_type')}
                                    </dt>
                                    <dd className="mt-1 text-foreground">
                                        {t(`approvals:request_types.${actionLabel}`)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-bold uppercase text-muted-foreground">
                                        {t('approvals:fields.requested_by')}
                                    </dt>
                                    <dd className="mt-1 break-words text-foreground">{requesterLabel}</dd>
                                </div>
                                <div className="col-span-2">
                                    <dt className="text-xs font-bold uppercase text-muted-foreground">
                                        {t('approvals:fields.reason')}
                                    </dt>
                                    <dd className="mt-1 break-words text-foreground">{reason}</dd>
                                </div>
                            </dl>

                            {showChanges && (
                                <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                                    <h4 className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
                                        {t('approvals:labels.proposed_changes')}
                                    </h4>
                                    {selectedApproval.governed_mutation ? (
                                        <GovernedMutationDiff
                                            before={selectedApproval.governed_mutation.before}
                                            after={selectedApproval.governed_mutation.after}
                                            mutationKind={selectedApproval.governed_mutation.mutation_kind}
                                            derivedImpact={selectedApproval.governed_mutation.derived_impact}
                                            impactedResources={selectedApproval.governed_mutation.impacted_resources}
                                            relationshipChange={selectedApproval.governed_mutation.relationship_change}
                                            testId={`approval-resolution-governed-${selectedApproval.id}`}
                                        />
                                    ) : (
                                        <LegacyApprovalChanges
                                            pendingChanges={selectedApproval.pending_changes!}
                                            resourceType={selectedApproval.resource_type}
                                            locale={locale}
                                            testId={`approval-resolution-legacy-${selectedApproval.id}`}
                                        />
                                    )}
                                </section>
                            )}

                            <textarea
                                ref={notesRef}
                                value={resolutionNotes}
                                onChange={(event) => onResolutionNotesChange(event.target.value)}
                                disabled={isSubmitting}
                                aria-labelledby={descriptionId}
                                placeholder={t('dialogs.resolution_placeholder')}
                                className="mt-4 h-32 w-full resize-none rounded-xl border border-white/10 bg-white/5 p-4 text-white outline-none placeholder:text-slate-600 focus:border-accent/50 disabled:cursor-not-allowed disabled:opacity-60"
                            />

                            {errorText && (
                                <p
                                    role="alert"
                                    className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
                                >
                                    {errorText}
                                </p>
                            )}

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={isSubmitting}
                                    className="px-4 py-2 text-sm font-bold text-slate-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {t('common:actions.close')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void submitResolution();
                                        if (!resolutionNotes.trim()) notesRef.current?.focus();
                                    }}
                                    disabled={isSubmitting}
                                    className={cn(
                                        'px-6 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50',
                                        dialogMode === 'approve'
                                            ? 'bg-emerald-500 hover:bg-emerald-600'
                                            : 'bg-rose-500 hover:bg-rose-600',
                                    )}
                                >
                                    {isSubmitting
                                        ? t('dialogs.processing')
                                        : dialogMode === 'approve'
                                          ? t('actions.approve')
                                          : t('actions.reject')}
                                </button>
                            </div>
                        </div>
        </DialogShell>
    );
}
