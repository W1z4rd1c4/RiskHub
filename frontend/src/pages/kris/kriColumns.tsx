import type { MouseEvent } from 'react';

import type { Column } from '@/components/tables';
import { formatMetricNumberValue } from '@/i18n/formatters';
import type { SafeTFunction } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { getKriMonitoringMeta } from '@/lib/monitoringStatus';
import type { KeyRiskIndicator } from '@/types/kri';

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
            render: (kri) => <span className="font-medium text-foreground">{kri.metric_name}</span>,
        },
        {
            key: 'current_value',
            label: t('kris:columns.value'),
            sortable: true,
            render: (kri) => {
                const monitoring = getKriMonitoringMeta(kri.monitoring_status);
                return <span className={`font-black ${monitoring.textClassName}`}>
                    {formatNumber(kri.current_value)} <span className="text-muted-foreground font-normal text-xs">{kri.unit}</span>
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
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold uppercase w-fit ${monitoring.badgeClassName}`}>
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        {t(monitoring.labelKey)}
                    </span>
                    {kri.is_archived ? <span className="rounded-md bg-slate-500/15 px-2 py-0.5 text-xs font-bold uppercase text-slate-300">{t('kris:filters.archived')}</span> : null}
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
                {kri.is_archived && resolveCapabilityFlag(kri.capabilities, 'can_restore') ? <button
                    type="button"
                    onClick={(event) => onRestore(kri.id, event)}
                    data-testid={`kri-unarchive-${kri.id}`}
                    className="px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-xs font-black uppercase tracking-wider"
                >{t('kris:actions.unarchive')}</button> : null}
            </div>,
        },
    ];
}
