import { Clock3, RotateCcw } from 'lucide-react';

import { GovernedMutationDiff } from '@/components/approvals/GovernedMutationDiff';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type {
    GovernedDerivedImpact,
    GovernedImpactedResource,
    GovernedMutationKind,
    GovernedRelationshipChange,
} from '@/types/approval';

/**
 * The slice of a governed pending change the panel renders. The Asset,
 * Process, Threat and Vendor `*PendingChangeRead` types all satisfy it, so a
 * module passes its record straight through.
 */
export interface PendingChangePanelData {
    reason: string;
    requested_at: string;
    requested_by_name: string | null;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    derived_impact: GovernedDerivedImpact;
    impacted_resources?: GovernedImpactedResource[];
    relationship_change?: GovernedRelationshipChange | null;
    mutation_kind?: GovernedMutationKind | null;
    capabilities: { can_view_diff: boolean; can_cancel: boolean };
}

/** Modules whose `pending_change.*` keys the panel reads. */
export type PendingChangePanelNamespace = 'assets' | 'processes' | 'threats' | 'vendors';

/**
 * The `pending_change.*` strings every module namespace provides (en + cs); a locale test
 * keeps the four namespaces complete, since the module-bound `t` below is not key-checked
 * by the static usage validator.
 */
export const PENDING_CHANGE_PANEL_KEYS = [
    'title',
    'badge',
    'cancel',
    'requested_by_at',
    'unknown_requester',
    'diff_restricted',
] as const;
type PendingChangePanelKey = typeof PENDING_CHANGE_PANEL_KEYS[number];

interface PendingChangePanelProps {
    pendingChange: PendingChangePanelData;
    /** i18n namespace owning `pending_change.{title,badge,cancel,requested_by_at,...}`. */
    namespace: PendingChangePanelNamespace;
    /** Singular entity name; yields `<prefix>-pending-change`, `-title` and `-diff` ids. */
    testIdPrefix: string;
    cancelling?: boolean;
    /** Opens the cancellation confirmation; the button is shown only when `can_cancel` is granted. */
    onCancel?: () => void;
}

/**
 * Pending governed change on an entity page (audit 2026-09-30 GAP-D-07, SM-05):
 * the one panel behind the Asset, Process and Threat detail and blocked-edit
 * views. Warning tokens only, so it reads in all three themes; the reason,
 * requester and proposed values are shown only with `can_view_diff`, otherwise
 * the restricted note stands in for them.
 */
export function PendingChangePanel({
    pendingChange,
    namespace,
    testIdPrefix,
    cancelling = false,
    onCancel,
}: PendingChangePanelProps) {
    const { t } = useTranslation(namespace);
    const format = useFormat();
    const text = (key: PendingChangePanelKey, options?: Record<string, string>) => t(`pending_change.${key}`, options);
    const canCancel = resolveCapabilityFlag(pendingChange.capabilities, 'can_cancel') && onCancel !== undefined;
    const canViewDiff = resolveCapabilityFlag(pendingChange.capabilities, 'can_view_diff');
    const titleId = `${testIdPrefix}-pending-change-title`;

    return (
        <Card
            as="section"
            className="space-y-5 border-warning/30"
            data-testid={`${testIdPrefix}-pending-change`}
            aria-labelledby={titleId}
        >
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <CardTitle id={titleId} className="text-warning-text">
                            {text('title')}
                        </CardTitle>
                        <Badge tone="warning">{text('badge')}</Badge>
                    </div>
                    {canViewDiff ? (
                        <>
                            <p className="mt-2 text-sm text-foreground">{pendingChange.reason}</p>
                            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                                {text('requested_by_at', {
                                    requester: pendingChange.requested_by_name ?? text('unknown_requester'),
                                    date: format.date(pendingChange.requested_at),
                                    time: format.time(pendingChange.requested_at),
                                })}
                            </p>
                        </>
                    ) : null}
                </div>
                {canCancel ? (
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        disabled={cancelling}
                        className="shrink-0"
                    >
                        <RotateCcw aria-hidden="true" />
                        {text('cancel')}
                    </Button>
                ) : null}
            </div>
            {canViewDiff ? (
                <GovernedMutationDiff
                    before={pendingChange.before}
                    after={pendingChange.after}
                    derivedImpact={pendingChange.derived_impact}
                    impactedResources={pendingChange.impacted_resources}
                    relationshipChange={pendingChange.relationship_change}
                    mutationKind={pendingChange.mutation_kind}
                    testId={`${testIdPrefix}-pending-change-diff`}
                />
            ) : (
                <p className="text-sm text-muted-foreground">{text('diff_restricted')}</p>
            )}
        </Card>
    );
}
