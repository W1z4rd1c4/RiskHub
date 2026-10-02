import { AnimatePresence, motion } from 'framer-motion';
import {
    Check,
    CheckCircle2,
    Archive,
    ChevronDown,
    ChevronUp,
    Clock,
    Edit,
    Link2,
    Plus,
    RotateCcw,
    X,
} from 'lucide-react';

import type { SafeTFunction } from '@/i18n/hooks';
import { formatDateValue, formatTimeValue } from '@/i18n/formatters';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { toneClass } from '@/lib/tones';
import { cn } from '@/lib/utils';
import type { ApprovalRequest } from '@/types/approval';

import { GovernedMutationDiff } from '@/components/approvals/GovernedMutationDiff';
import { LegacyApprovalChanges } from '@/components/approvals/LegacyApprovalChanges';
import { getApprovalActionTone, getApprovalStatusTone, getGovernedActionLabel } from './approvalsPresentation';
import { canViewApprovalPendingChanges } from './approvalPendingChanges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, LoadingState } from '@/components/ui/state';

interface ApprovalListProps {
    approvals: ApprovalRequest[];
    loading: boolean;
    expandedRows: Set<number>;
    locale?: string;
    onToggleRow: (approvalId: number) => void;
    onApprove: (approval: ApprovalRequest) => void;
    onReject: (approval: ApprovalRequest) => void;
    onCancel: (approvalId: number) => void;
    t: SafeTFunction;
}

export function ApprovalList({
    approvals,
    loading,
    expandedRows,
    locale = 'en',
    onToggleRow,
    onApprove,
    onReject,
    onCancel,
    t,
}: ApprovalListProps) {
    if (loading) {
        return (
            <LoadingState className="py-20" />
        );
    }

    if (approvals.length === 0) {
        return (
            <EmptyState
                icon={CheckCircle2}
                title={t('empty_state.all_caught_up')}
                description={t('empty_state.no_matching')}
                className="rounded-2xl border-2 border-dashed border-border"
            />
        );
    }

    return (
        <div className="space-y-4">
            {approvals.map((approval) => {
                const canViewPendingChanges = canViewApprovalPendingChanges(approval);
                const governedActionLabel = getGovernedActionLabel(
                    approval.action_type,
                    approval.governed_mutation?.mutation_kind,
                );
                const ActionIcon = governedActionLabel === 'create'
                    ? Plus
                    : governedActionLabel === 'archive'
                        ? Archive
                        : governedActionLabel.startsWith('link_')
                            ? Link2
                            : Edit;

                return (
                    <div
                        key={approval.id}
                        className="glass-card p-0 overflow-hidden"
                    >
                    <div className="p-6 flex flex-col lg:flex-row lg:items-center gap-6">
                        <div className="flex flex-col gap-2 min-w-[120px]">
                            <div className="flex items-center gap-2">
                                <span className="text-eyebrow">
                                    {t(`entity_types.${approval.resource_type}`)}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                {/* D10: delete requests archive a restorable record, so they share the Archive icon. */}
                                <Badge
                                    size="sm"
                                    shape="rounded"
                                    tone={getApprovalActionTone(approval.action_type)}
                                    icon={ActionIcon}
                                    className="w-fit"
                                >
                                    {t(`request_types.${governedActionLabel}`)}
                                </Badge>
                            </div>
                        </div>

                        <div className="flex-1">
                            <h3 className="text-base font-bold text-foreground mb-1">{approval.resource_name}</h3>
                            <p className="text-sm text-muted-foreground mb-2">
                                <span className="text-muted-foreground">{t('approvals:labels.re')}</span> {approval.reason}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" aria-hidden="true" />
                                    {formatDateValue(approval.created_at, locale)}
                                </span>
                                <span>
                                    {t('labels.by')} <span className="text-accent-text">{approval.requested_by_name}</span>
                                </span>
                            </div>

                            {(approval.status === 'approved' || approval.status === 'rejected') && approval.resolved_at && (
                                <div className="mt-3 pt-3 border-t border-border">
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-1">
                                        <span
                                            className={
                                                approval.status === 'approved'
                                                    ? 'text-success-text'
                                                    : 'text-destructive'
                                            }
                                        >
                                            {approval.status === 'approved'
                                                ? t('labels.approved_on', {
                                                      date: formatDateValue(approval.resolved_at, locale),
                                                      time: formatTimeValue(approval.resolved_at, locale),
                                                  })
                                                : t('labels.rejected_on', {
                                                      date: formatDateValue(approval.resolved_at, locale),
                                                      time: formatTimeValue(approval.resolved_at, locale),
                                                  })}
                                        </span>
                                        {approval.resolved_by_name && (
                                            <span>
                                                {t('labels.by')} <span className="text-accent-text">{approval.resolved_by_name}</span>
                                            </span>
                                        )}
                                    </div>
                                    {approval.resolution_notes && (
                                        <p className="text-xs text-muted-foreground italic">"{approval.resolution_notes}"</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-4 justify-between lg:justify-end min-w-[200px]">
                            <Badge tone={getApprovalStatusTone(approval.status)}>
                                {t(`status.${approval.status}`)}
                            </Badge>

                            <div className="flex items-center gap-2">
                                {canViewPendingChanges && (
                                    <Button
                                        variant="ghost"
                                        size="iconCompact"
                                        onClick={() => onToggleRow(approval.id)}
                                        className="text-muted-foreground"
                                        title={t('common:tooltips.view_changes')}
                                        aria-label={t('common:tooltips.view_changes')}
                                        aria-expanded={expandedRows.has(approval.id)}
                                    >
                                        {expandedRows.has(approval.id) ? (
                                            <ChevronUp aria-hidden="true" />
                                        ) : (
                                            <ChevronDown aria-hidden="true" />
                                        )}
                                    </Button>
                                )}

                                {(approval.status === 'pending' || approval.status === 'pending_privileged') && (
                                    <>
                                        {resolveCapabilityFlag(approval.capabilities, 'can_approve') && (
                                            <Button
                                                variant="outline"
                                                size="iconCompact"
                                                onClick={() => onApprove(approval)}
                                                className={cn(toneClass('success', 'badge'), 'hover:bg-success/20 hover:text-success-text')}
                                                title={t('common:actions.approve')}
                                                aria-label={t('common:actions.approve')}
                                            >
                                                <Check aria-hidden="true" />
                                            </Button>
                                        )}
                                        {resolveCapabilityFlag(approval.capabilities, 'can_reject') && (
                                            <Button
                                                variant="outline"
                                                size="iconCompact"
                                                onClick={() => onReject(approval)}
                                                className={cn(toneClass('danger', 'badge'), 'hover:bg-destructive/20 hover:text-destructive')}
                                                title={t('common:actions.reject')}
                                                aria-label={t('common:actions.reject')}
                                            >
                                                <X aria-hidden="true" />
                                            </Button>
                                        )}
                                    </>
                                )}

                                {resolveCapabilityFlag(
                                    approval.capabilities,
                                    approval.governed_mutation
                                        ? 'can_cancel_as_requester'
                                        : 'can_cancel',
                                ) && (
                                        <Button
                                            variant="ghost"
                                            size="iconCompact"
                                            onClick={() => onCancel(approval.id)}
                                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            title={t('common:tooltips.cancel_request')}
                                            aria-label={t('common:tooltips.cancel_request')}
                                        >
                                            <RotateCcw aria-hidden="true" />
                                        </Button>
                                    )}
                            </div>
                        </div>
                    </div>

                    <AnimatePresence>
                        {(approval.action_type === 'edit' || approval.governed_mutation != null) &&
                            expandedRows.has(approval.id) &&
                            canViewPendingChanges && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="bg-tint/[0.03] border-t border-border px-6 py-4"
                                >
                                    <h4 className="text-eyebrow mb-3">
                                        {t('labels.proposed_changes')}
                                    </h4>
                                    {approval.governed_mutation ? (
                                        <GovernedMutationDiff
                                            before={approval.governed_mutation.before}
                                            after={approval.governed_mutation.after}
                                            mutationKind={approval.governed_mutation.mutation_kind}
                                            derivedImpact={approval.governed_mutation.derived_impact}
                                            impactedResources={approval.governed_mutation.impacted_resources}
                                            relationshipChange={approval.governed_mutation.relationship_change}
                                            testId={`approval-governed-mutation-${approval.id}`}
                                        />
                                    ) : (
                                        <LegacyApprovalChanges
                                            pendingChanges={approval.pending_changes!}
                                            resourceType={approval.resource_type}
                                            locale={locale}
                                            testId={`approval-legacy-changes-${approval.id}`}
                                        />
                                    )}
                                </motion.div>
                            )}
                    </AnimatePresence>
                    </div>
                );
            })}
        </div>
    );
}
