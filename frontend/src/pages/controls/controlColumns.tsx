import type { MouseEvent } from 'react';
import { Calendar, Lock } from 'lucide-react';

import type { Column } from '@/components/tables';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { getControlMonitoringMeta } from '@/lib/monitoringStatus';
import type { ControlSummary } from '@/types/control';

import { ARCHIVED_CONTROL_BADGE_CLASS_NAME, getControlRiskLevelColor } from './controlsPagePresentation';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

interface BuildControlColumnsOptions {
    onRestore: (controlId: number, event: MouseEvent) => void | Promise<void>;
    pendingApprovalIds: Set<number>;
    translate: TranslateFn;
}

export function buildControlColumns({
    onRestore,
    pendingApprovalIds,
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
                    {pendingApprovalIds.has(control.id) ? (
                        <div
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-warning/10 text-warning-text border border-warning/20"
                            title={translate('columns.pending_changes_title')}
                        >
                            <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                            {translate('columns.pending')}
                        </div>
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
                <div className="flex items-center gap-2 text-xs text-muted-foreground capitalize">
                    <Calendar className="h-3 w-3 text-accent" aria-hidden="true" />
                    {translate(`frequencies.${control.frequency}`, { defaultValue: control.frequency })}
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
                    <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getControlRiskLevelColor(control.risk_level)}`}>
                        {control.risk_level} / 5
                    </div>
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
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${monitoring.badgeClassName}`}>
                            <MonitoringIcon className="h-3 w-3" aria-hidden="true" />
                            {translate(monitoring.labelKey)}
                        </span>
                        {control.is_archived ? (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${ARCHIVED_CONTROL_BADGE_CLASS_NAME}`}>
                                {translate('status.archived')}
                            </span>
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
                        <button
                            type="button"
                            onClick={(event) => onRestore(control.id, event)}
                            data-testid={`control-unarchive-${control.id}`}
                            className="px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-[10px] font-black uppercase tracking-wider"
                        >
                            {translate('actions.unarchive')}
                        </button>
                    ) : null}
                </div>
            ),
        },
    ];
}
