import type { MouseEvent } from 'react';
import { Calendar } from 'lucide-react';

import { PendingChangeBadge } from '@/components/approvals/PendingChangeBadge';
import type { Column } from '@/components/tables';
import { RowRestoreButton } from '@/components/tables/RowRestoreButton';
import { Badge } from '@/components/ui/badge';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { getControlMonitoringMeta } from '@/lib/monitoringStatus';
import type { ControlSummary } from '@/types/control';

import { formatControlFrequency, getControlRiskLevelColor } from './controlsPagePresentation';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

interface BuildControlColumnsOptions {
    onRestore: (controlId: number, event: MouseEvent) => void | Promise<void>;
    translate: TranslateFn;
}

export function buildControlColumns({
    onRestore,
    translate,
}: BuildControlColumnsOptions): Column<ControlSummary>[] {
    return [
        {
            key: 'name',
            label: translate('columns.name'),
            sortable: true,
            render: (control) => (
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{control.name}</span>
                    {(resolveCapabilityFlag(control.capabilities, 'has_pending_delete_approval')
                        || resolveCapabilityFlag(control.capabilities, 'has_pending_update_approval')) ? (
                        <PendingChangeBadge data-testid={`control-pending-${control.id}`} />
                    ) : null}
                </div>
            ),
        },
        {
            key: 'department',
            label: translate('columns.department'),
            sortable: true,
            render: (control) => (
                <span className="text-xs font-medium text-muted-foreground">
                    {control.department_name || translate('common:fallbacks.unassigned')}
                </span>
            ),
        },
        {
            key: 'frequency',
            label: translate('columns.frequency'),
            sortable: true,
            render: (control) => (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3 text-accent-text" aria-hidden="true" />
                    {formatControlFrequency(control.frequency, (key, fallback) => translate(key, { defaultValue: fallback }))}
                </div>
            ),
        },
        {
            key: 'risk_level',
            label: translate('columns.risk_level'),
            sortable: true,
            className: 'text-center',
            render: (control) => (
                <div className="flex justify-center">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums ${getControlRiskLevelColor(control.risk_level)}`}>
                        {translate('columns.risk_level_value', { level: control.risk_level })}
                    </span>
                </div>
            ),
        },
        {
            key: 'status',
            label: translate('columns.status'),
            sortable: true,
            render: (control) => {
                const monitoring = getControlMonitoringMeta(control.monitoring_status);
                const MonitoringIcon = monitoring.icon;
                return (
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge size="sm" shape="rounded" icon={MonitoringIcon} className={monitoring.badgeClassName}>
                            {translate(monitoring.labelKey)}
                        </Badge>
                        {control.is_archived ? (
                            <Badge size="sm" shape="rounded" tone="neutral">
                                {translate('status.archived')}
                            </Badge>
                        ) : null}
                    </div>
                );
            },
        },
        {
            key: 'actions',
            label: '',
            render: (control) => (
                <div className="text-right flex items-center justify-end gap-2">
                    {control.is_archived && resolveCapabilityFlag(control.capabilities, 'can_restore') ? (
                        <RowRestoreButton
                            itemName={control.name}
                            onClick={(event) => onRestore(control.id, event)}
                            data-testid={`control-unarchive-${control.id}`}
                        />
                    ) : null}
                </div>
            ),
        },
    ];
}
