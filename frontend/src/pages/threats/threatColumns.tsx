import type { MouseEvent } from 'react';

import { PendingChangeBadge } from '@/components/approvals/PendingChangeBadge';
import type { Column } from '@/components/tables/SortableTable';
import { RowRestoreButton } from '@/components/tables/RowRestoreButton';
import { Badge } from '@/components/ui/badge';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { Tone } from '@/lib/tones';
import type { ThreatListItem } from '@/types/threat';

import { getThreatDisplayStatus, threatCategoryLabel, type ThreatDisplayStatus } from './threatsPagePresentation';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type BuildThreatColumnsParams = {
    t: TranslateFn;
    onRestore: (threatId: number, event: MouseEvent) => void | Promise<void>;
    canRestoreThreat: (threat: ThreatListItem) => boolean;
};

/** Lifecycle status tone (D1): active reads success, archived neutral. */
export function getThreatStatusTone(status: ThreatDisplayStatus): Tone {
    return status === 'archived' ? 'neutral' : 'success';
}

export function buildThreatColumns({
    t,
    onRestore,
    canRestoreThreat,
}: BuildThreatColumnsParams): Column<ThreatListItem>[] {
    return [
        {
            key: 'name',
            label: t('threats:columns.name'),
            sortable: true,
            className: 'w-[300px] min-w-[220px]',
            render: (threat) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-foreground">{threat.name}</span>
                    {threat.description ? (
                        // P9 (FR-P5-4): truncated cell exposes the full value on
                        // hover via `title`, with `cursor-help` as the hover cue.
                        <span
                            title={threat.description}
                            className="text-xs text-muted-foreground truncate max-w-[280px] cursor-help"
                        >
                            {threat.description}
                        </span>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'category',
            label: t('threats:columns.category'),
            sortable: true,
            render: (threat) => <span className="text-sm text-foreground">{threatCategoryLabel(t, threat.category)}</span>,
        },
        {
            key: 'threat_steward',
            label: t('threats:columns.threat_steward'),
            sortable: true,
            render: (threat) => (
                <span className="text-sm text-foreground">
                    {threat.threat_steward?.name ?? t('common:fallbacks.unknown_user')}
                </span>
            ),
        },
        {
            key: 'typical_weaknesses',
            label: t('threats:columns.typical_weaknesses'),
            render: (threat) => (
                // P9 (FR-P5-4): truncated free text gets `title` (full value on
                // hover) + `cursor-help` cue; the em-dash placeholder gets neither.
                <span
                    title={threat.typical_weaknesses ?? undefined}
                    className={`text-sm text-muted-foreground truncate block max-w-[260px] ${
                        threat.typical_weaknesses ? 'cursor-help' : ''
                    }`}
                >
                    {threat.typical_weaknesses ?? '—'}
                </span>
            ),
        },
        {
            key: 'relevant_subject',
            label: t('threats:columns.relevant_subject'),
            sortable: true,
            render: (threat) => <span className="text-sm text-foreground">{threat.relevant_subject ?? '—'}</span>,
        },
        {
            key: 'linked_risk_count',
            label: t('threats:columns.linked_risks'),
            sortable: true,
            className: 'text-right',
            headerClassName: 'text-right',
            render: (threat) => (
                <span className="text-sm tabular-nums text-foreground">{threat.visible_linked_risk_count}</span>
            ),
        },
        {
            key: 'status',
            label: t('threats:columns.status'),
            className: 'w-[130px]',
            render: (threat) => {
                const status = getThreatDisplayStatus(threat);
                return (
                    <div className="flex items-center gap-2">
                        <Badge tone={getThreatStatusTone(status)}>{t(`threats:status.${status}`)}</Badge>
                        {resolveCapabilityFlag(threat.capabilities, 'has_pending_change') ? (
                            <PendingChangeBadge data-testid={`threat-pending-change-${threat.id}`} />
                        ) : null}
                        {threat.stewardship_status === 'pending_governance' ? (
                            <Badge tone="warning">{t('threats:status.pending_governance')}</Badge>
                        ) : null}
                        {status === 'archived' && canRestoreThreat(threat) ? (
                            <RowRestoreButton
                                itemName={threat.name}
                                data-testid={`threat-restore-${threat.id}`}
                                onClick={(event) => void onRestore(threat.id, event)}
                            />
                        ) : null}
                    </div>
                );
            },
        },
    ];
}
