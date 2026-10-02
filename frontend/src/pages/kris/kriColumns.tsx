import type { MouseEvent } from 'react';

import { PendingChangeBadge } from '@/components/approvals/PendingChangeBadge';
import type { Column } from '@/components/tables';
import { RowRestoreButton } from '@/components/tables/RowRestoreButton';
import { Badge } from '@/components/ui/badge';
import { formatMetricNumberValue } from '@/i18n/formatters';
import type { SafeTFunction } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { formatKriUnit } from '@/lib/kriUnits';
import { getKriMonitoringMeta } from '@/lib/monitoringStatus';
import type { KeyRiskIndicator } from '@/types/kri';

/** PG-29: any change of the KRI waiting for approval (update, archive, value, history correction). */
export function hasPendingKriApproval(kri: Pick<KeyRiskIndicator, 'capabilities'>): boolean {
    return resolveCapabilityFlag(kri.capabilities, 'has_pending_update_approval')
        || resolveCapabilityFlag(kri.capabilities, 'has_pending_delete_approval')
        || resolveCapabilityFlag(kri.capabilities, 'has_pending_value_submission_approval')
        || resolveCapabilityFlag(kri.capabilities, 'has_pending_history_correction_approval');
}

export function buildKriColumns({
    language,
    onRestore,
    t,
}: {
    language: string;
    onRestore: (kriId: number, event: MouseEvent) => void | Promise<void>;
    t: SafeTFunction;
}): Column<KeyRiskIndicator>[] {
    const formatNumber = (value: number) => formatMetricNumberValue(value, language);
    return [
        {
            key: 'metric_name',
            label: t('kris:columns.metric'),
            sortable: true,
            render: (kri) => <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{kri.metric_name}</span>
                {hasPendingKriApproval(kri) ? <PendingChangeBadge data-testid={`kri-pending-${kri.id}`} /> : null}
            </div>,
        },
        {
            key: 'current_value',
            label: t('kris:columns.value'),
            sortable: true,
            render: (kri) => {
                const monitoring = getKriMonitoringMeta(kri.monitoring_status);
                return <span className={`font-bold tabular-nums ${monitoring.textClassName}`}>
                    {formatNumber(kri.current_value)} <span className="text-muted-foreground font-normal text-xs">{formatKriUnit(kri.unit, t, kri.current_value)}</span>
                </span>;
            },
        },
        {
            key: 'lower_limit',
            label: t('kris:columns.limits'),
            render: (kri) => <span className="text-xs text-muted-foreground">
                {formatNumber(kri.lower_limit)} - {formatNumber(kri.upper_limit)}
            </span>,
        },
        {
            key: 'monitoring_status',
            label: t('kris:columns.status'),
            sortable: true,
            render: (kri) => {
                const monitoring = getKriMonitoringMeta(kri.monitoring_status);
                const Icon = monitoring.icon;
                return <div className="flex flex-wrap items-center gap-2">
                    <Badge size="sm" shape="rounded" icon={Icon} className={monitoring.badgeClassName}>
                        {t(monitoring.labelKey)}
                    </Badge>
                    {kri.is_archived ? <Badge size="sm" shape="rounded" tone="neutral">{t('kris:filters.archived')}</Badge> : null}
                </div>;
            },
        },
        {
            key: 'risk_process',
            label: t('kris:columns.risk'),
            sortable: true,
            render: (kri) => <span className="text-foreground text-xs font-bold block truncate max-w-[150px]" title={kri.risk_process ?? undefined}>
                {kri.risk_process || t('common:fallbacks.unknown_risk')}
            </span>,
        },
        {
            key: 'risk_description',
            label: t('kris:columns.description'),
            sortable: true,
            render: (kri) => <span className="text-muted-foreground text-xs font-medium block truncate max-w-[200px]" title={kri.risk_description ?? undefined}>
                {kri.risk_description || t('common:fallbacks.not_available')}
            </span>,
        },
        {
            key: 'actions',
            label: '',
            render: (kri) => <div className="flex items-center justify-end gap-2">
                {kri.is_archived && resolveCapabilityFlag(kri.capabilities, 'can_restore') ? <RowRestoreButton
                    itemName={kri.metric_name}
                    onClick={(event) => onRestore(kri.id, event)}
                    data-testid={`kri-unarchive-${kri.id}`}
                /> : null}
            </div>,
        },
    ];
}
