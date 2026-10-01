import { useId, useRef } from 'react';

import type { SafeTFunction } from '@/i18n/hooks';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { InlineMessage } from '@/components/ui/inline-message';
import { Textarea } from '@/components/ui/textarea';
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
            isBusy={isSubmitting}
            size="lg"
        >
            <DialogHeader
                title={dialogMode === 'approve'
                    ? t('dialogs.approve_title')
                    : t('dialogs.reject_title')}
                description={t('dialogs.resolution_required')}
                descriptionId={descriptionId}
                hideClose
            />
            <DialogBody>
                <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-secondary p-4 text-sm">
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
                    <section className="rounded-xl border border-border bg-nested p-4">
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

                <Textarea
                    ref={notesRef}
                    value={resolutionNotes}
                    onChange={(event) => onResolutionNotesChange(event.target.value)}
                    disabled={isSubmitting}
                    aria-labelledby={descriptionId}
                    placeholder={t('dialogs.resolution_placeholder')}
                    className="h-32 resize-none"
                />

                {errorText && (
                    <InlineMessage tone="danger">
                        {errorText}
                    </InlineMessage>
                )}

            </DialogBody>
            <DialogFooter>
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                    {t('common:actions.close')}
                </Button>
                <Button
                    type="button"
                    variant={dialogMode === 'approve' ? 'success' : 'destructive'}
                    isLoading={isSubmitting}
                    onClick={() => {
                        void submitResolution();
                        if (!resolutionNotes.trim()) notesRef.current?.focus();
                    }}
                >
                    {isSubmitting
                        ? t('dialogs.processing')
                        : dialogMode === 'approve'
                          ? t('actions.approve')
                          : t('actions.reject')}
                </Button>
            </DialogFooter>
        </DialogShell>
    );
}
