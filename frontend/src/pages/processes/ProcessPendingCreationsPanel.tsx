import { Clock, RotateCcw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { ProcessPendingCreationRead } from '@/types/process';
import type { ApprovalQueueTab } from '@/pages/approvals/approvalNavigation';

interface ProcessPendingCreationsPanelProps {
    items: ProcessPendingCreationRead[];
    cancellingApprovalId: number | null;
    /** Opens the cancellation confirmation (GAP-D-08); the name feeds its copy. */
    onCancel: (approvalId: number, targetName: string) => void;
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
    const { t } = useTranslation('processes');
    const format = useFormat();
    if (items.length === 0) return null;

    return (
        <Card
            as="section"
            aria-labelledby="process-pending-creations-heading"
            className="border-warning/20"
            data-testid="process-pending-creations"
        >
            <CardHeader
                title={t('pending_creation.title')}
                titleId="process-pending-creations-heading"
                description={t('pending_creation.description')}
            />
            <ul className="space-y-3">
                {items.map((item) => {
                    const canViewDiff = resolveCapabilityFlag(item.capabilities, 'can_view_diff');
                    const itemName = canViewDiff
                        ? safeLabel(item.proposed.l1_process, t('pending_creation.unnamed'))
                        : t('pending_creation.unnamed');
                    // The row buttons repeat per item, so they are described by the row heading.
                    const headingId = canViewDiff ? `process-pending-creation-${item.approval_id}-title` : undefined;
                    return (
                    <li key={item.approval_id} className="rounded-xl border border-border bg-tint/[0.03] p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge tone="warning">{t('pending_creation.badge')}</Badge>
                                    {canViewDiff ? (
                                        <Badge tone="neutral" variant="outline">
                                            {t('derived.cif')}: {t(`values.cif_override.${item.derived.cif}`)}
                                        </Badge>
                                    ) : null}
                                </div>
                                {canViewDiff ? (
                                    <>
                                        <h3 id={headingId} className="text-base font-bold text-foreground">
                                            {itemName}
                                        </h3>
                                        <dl className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                                            <div>
                                                <dt className="font-bold uppercase tracking-wider text-muted-foreground">{t('form.owner')}</dt>
                                                <dd>{safeLabel(item.proposed.process_owner, t('ownership_display.unknown_user'))}</dd>
                                            </div>
                                            <div>
                                                <dt className="font-bold uppercase tracking-wider text-muted-foreground">{t('form.owner_department')}</dt>
                                                <dd>{safeLabel(item.proposed.owning_department, t('ownership_display.unknown_department'))}</dd>
                                            </div>
                                        </dl>
                                        <p className="text-sm text-muted-foreground">{item.reason}</p>
                                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Clock className="h-3 w-3" aria-hidden="true" />
                                            {t('pending_creation.requested_by_at', {
                                                requester: item.requested_by_name ?? t('pending_change.unknown_requester'),
                                                date: format.date(item.requested_at),
                                                time: format.time(item.requested_at),
                                            })}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-xs text-muted-foreground">{t('pending_change.diff_restricted')}</p>
                                )}
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <Button
                                    variant="outline"
                                    size="compact"
                                    aria-describedby={headingId}
                                    onClick={() => onOpenRequest(
                                        item.approval_id,
                                        resolveCapabilityFlag(item.capabilities, 'is_requester')
                                            ? 'mine'
                                            : resolveCapabilityFlag(item.capabilities, 'can_resolve')
                                                ? 'pending'
                                                : 'mine',
                                    )}
                                >
                                    {t('pending_creation.open_request')}
                                </Button>
                                {resolveCapabilityFlag(item.capabilities, 'can_cancel') ? (
                                    <Button
                                        variant="outline"
                                        size="compact"
                                        disabled={cancellingApprovalId === item.approval_id}
                                        aria-describedby={headingId}
                                        onClick={() => onCancel(item.approval_id, itemName)}
                                    >
                                        <RotateCcw aria-hidden="true" />
                                        {t('pending_change.cancel')}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </li>
                    );
                })}
            </ul>
        </Card>
    );
}
