import type { MouseEvent } from 'react';
import { AlertCircle } from 'lucide-react';

import { PendingChangeBadge } from '@/components/approvals/PendingChangeBadge';
import { RiskPriorityBadge, RiskStatusBadge } from '@/components/risks/RiskStatusBadge';
import { Badge } from '@/components/ui/badge';
import { RiskTypeBadge } from '@/components/ui/RiskTypeBadge';
import { RowRestoreButton } from '@/components/tables/RowRestoreButton';
import type { Column } from '@/components/tables/SortableTable';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { RiskSummary } from '@/types/risk';
import { getRiskDisplayStatus } from '@/pages/risks/risksPagePresentation';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type BuildRiskColumnsParams = {
    t: TranslateFn;
    getColor: (riskType: string) => string;
    getDisplayName: (riskType: string) => string;
    getInitials: (riskType: string) => string;
    getScoreColor: (score: number) => string;
    handleRestoreRisk: (riskId: number, event: MouseEvent) => void | Promise<void>;
};

export function buildRiskColumns({
    t,
    getColor,
    getDisplayName,
    getInitials,
    getScoreColor,
    handleRestoreRisk,
}: BuildRiskColumnsParams): Column<RiskSummary>[] {
    return [
        {
            key: 'name',
            label: t('columns.name'),
            className: 'w-[450px] min-w-[300px]',
            sortable: true,
            render: (risk) => (
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{risk.name}</span>
                        {risk.is_priority && <RiskPriorityBadge />}
                        {(resolveCapabilityFlag(risk.capabilities, 'has_pending_delete_approval')
                            || resolveCapabilityFlag(risk.capabilities, 'has_pending_update_approval')) && (
                            <PendingChangeBadge data-testid={`risk-pending-${risk.id}`} />
                        )}
                    </div>
                    <span className="text-xs text-muted-foreground">{risk.process}</span>
                </div>
            ),
        },
        {
            key: 'category',
            label: t('columns.category'),
            sortable: true,
            render: (risk) => <span className="text-xs font-medium text-muted-foreground">{risk.category || '—'}</span>,
        },
        {
            key: 'description',
            label: t('columns.description'),
            sortable: true,
            // PG-41: CSS truncation with the full text as the tooltip (§4.13).
            render: (risk) => (
                <span className="block max-w-[200px] truncate text-xs text-muted-foreground" title={risk.description || undefined}>
                    {risk.description || ''}
                </span>
            ),
        },
        {
            key: 'risk_type',
            label: t('columns.type'),
            sortable: true,
            className: 'text-center',
            render: (risk) => {
                const typeColor = getColor(risk.risk_type);
                return (
                    <div className="flex justify-center">
                        <RiskTypeBadge
                            label={getInitials(risk.risk_type)}
                            color={typeColor}
                            title={getDisplayName(risk.risk_type)}
                            className="rounded-md px-2 py-0.5"
                        />
                    </div>
                );
            },
        },
        {
            key: 'gross_score',
            label: t('columns.gross'),
            sortable: true,
            className: 'text-center',
            render: (risk) => (
                <div className="flex justify-center">
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-bold tabular-nums ${getScoreColor(risk.gross_score)}`}>
                        {risk.gross_score}
                    </span>
                </div>
            ),
        },
        {
            key: 'net_score',
            label: t('columns.net'),
            sortable: true,
            className: 'text-center',
            render: (risk) => (
                <div className="flex justify-center">
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-bold tabular-nums ${getScoreColor(risk.net_score)}`}>
                        {risk.net_score}
                    </span>
                </div>
            ),
        },
        {
            key: 'status',
            label: t('fields.status'),
            sortable: true,
            render: (risk) => <RiskStatusBadge status={getRiskDisplayStatus(risk)} size="sm" />,
        },
        {
            key: 'control_count',
            label: t('columns.controls'),
            sortable: true,
            className: 'text-center',
            render: (risk) => {
                const count = risk.control_count || 0;
                if (count === 0) return <span className="text-xs text-muted-foreground">—</span>;
                return (
                    <div className="flex justify-center">
                        <Badge tone="info" size="sm" shape="rounded">
                            {t('risks:columns.control_count', { count })}
                        </Badge>
                    </div>
                );
            },
        },
        {
            key: 'kri_count',
            label: t('columns.kris'),
            sortable: true,
            className: 'text-center',
            render: (risk) => {
                const count = risk.kri_count || 0;
                const hasBreach = risk.has_breach || false;

                if (count === 0) return <span className="text-xs text-muted-foreground">—</span>;

                return (
                    <div className="flex justify-center">
                        <Badge
                            tone={hasBreach ? 'danger' : 'success'}
                            size="sm"
                            shape="rounded"
                            icon={hasBreach ? AlertCircle : undefined}
                            title={hasBreach ? t('risks:columns.kri_breach') : undefined}
                        >
                            {t('risks:columns.kri_count', { count })}
                            {hasBreach ? <span className="sr-only">{t('risks:columns.kri_breach')}</span> : null}
                        </Badge>
                    </div>
                );
            },
        },
        {
            key: 'actions',
            label: '',
            render: (risk) => (
                <div className="text-right flex items-center justify-end gap-2">
                    {risk.is_archived && resolveCapabilityFlag(risk.capabilities, 'can_restore') && (
                        <RowRestoreButton
                            itemName={risk.name}
                            onClick={(e) => handleRestoreRisk(risk.id, e)}
                            data-testid={`risk-unarchive-${risk.id}`}
                        />
                    )}
                </div>
            ),
        },
    ];
}
