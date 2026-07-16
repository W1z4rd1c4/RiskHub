import type { MouseEvent } from 'react';
import { ArchiveRestore } from 'lucide-react';

import type { Column } from '@/components/tables/SortableTable';
import type { ThreatListItem } from '@/types/threat';

import { getThreatDisplayStatus, threatCategoryLabel, type ThreatDisplayStatus } from './threatsPagePresentation';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type BuildThreatColumnsParams = {
    t: TranslateFn;
    onRestore: (threatId: number, event: MouseEvent) => void | Promise<void>;
    canRestoreThreat: (threat: ThreatListItem) => boolean;
};

export function getThreatStatusColor(status: ThreatDisplayStatus): string {
    return status === 'archived' ? 'text-slate-400 bg-slate-400/10' : 'text-emerald-400 bg-emerald-400/10';
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
                    <span className="text-sm font-bold text-white">{threat.name}</span>
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
            render: (threat) => <span className="text-sm text-slate-300">{threatCategoryLabel(t, threat.category)}</span>,
        },
        {
            key: 'threat_steward',
            label: t('threats:columns.threat_steward'),
            sortable: true,
            render: (threat) => (
                <span className="text-sm text-slate-300">
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
                    className={`text-sm text-slate-300 truncate block max-w-[260px] ${
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
            render: (threat) => <span className="text-sm text-slate-300">{threat.relevant_subject ?? '—'}</span>,
        },
        {
            key: 'linked_risk_count',
            label: t('threats:columns.linked_risks'),
            sortable: true,
            className: 'text-right',
            headerClassName: 'text-right',
            render: (threat) => (
                <span className="text-sm tabular-nums text-slate-300">{threat.visible_linked_risk_count}</span>
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
                        <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getThreatStatusColor(status)}`}
                        >
                            {t(`threats:status.${status}`)}
                        </span>
                        {threat.stewardship_status === 'pending_governance' ? (
                            <span className="inline-flex items-center rounded-full bg-amber-400/10 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                                {t('threats:status.pending_governance')}
                            </span>
                        ) : null}
                        {status === 'archived' && canRestoreThreat(threat) ? (
                            <button
                                type="button"
                                data-testid={`threat-restore-${threat.id}`}
                                onClick={(event) => void onRestore(threat.id, event)}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                aria-label={t('threats:actions.restore')}
                                title={t('threats:actions.restore')}
                            >
                                <ArchiveRestore className="h-4 w-4" />
                            </button>
                        ) : null}
                    </div>
                );
            },
        },
    ];
}
