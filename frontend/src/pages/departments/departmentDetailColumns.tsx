import { AlertCircle, CheckCircle, MinusCircle, XCircle } from 'lucide-react';

import type { Column } from '@/components/tables';
import { getKriMonitoringMeta } from '@/lib/monitoringStatus';
import type { ControlSummary } from '@/types/control';
import type { KeyRiskIndicator } from '@/types/kri';
import type { RiskSummary } from '@/types/risk';
import type { DeptUser } from '@/hooks/useDepartmentDetail';

type TranslateFn = (key: string) => string;

export const getRiskColumns = (t: TranslateFn): Column<RiskSummary>[] => [
    {
        key: 'name',
        label: t('common:labels.risk_name'),
        sortable: true,
        render: (risk) => <span className="font-medium text-white">{risk.name}</span>,
    },
    {
        key: 'description',
        label: t('common:labels.description'),
        sortable: false,
        render: (risk) => (
            <span className="text-slate-400 text-xs line-clamp-2 max-w-xs">
                {risk.description || t('common:fallbacks.not_available')}
            </span>
        ),
    },
    { key: 'process', label: t('common:labels.process'), sortable: true },
    { key: 'category', label: t('common:labels.category'), sortable: true },
    {
        key: 'risk_type',
        label: t('common:labels.type'),
        sortable: true,
        render: (risk) => (
            <span className="text-slate-400 capitalize">{risk.risk_type || t('common:fallbacks.not_available')}</span>
        ),
    },
    {
        key: 'status',
        label: t('common:labels.status'),
        sortable: true,
        render: (risk) => (
            <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                    risk.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : risk.status === 'emerging'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-slate-500/20 text-slate-400'
                }`}
            >
                {risk.status}
            </span>
        ),
    },
    {
        key: 'gross_score',
        label: t('common:labels.gross'),
        sortable: true,
        render: (risk) => (
            <span
                className={`text-sm font-black ${
                    risk.gross_score >= 16
                        ? 'text-rose-400'
                        : risk.gross_score >= 10
                            ? 'text-orange-400'
                            : risk.gross_score >= 5
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                }`}
            >
                {risk.gross_score}
            </span>
        ),
    },
    {
        key: 'net_score',
        label: t('common:labels.net'),
        sortable: true,
        render: (risk) => (
            <span
                className={`text-sm font-black ${
                    risk.net_score >= 16
                        ? 'text-rose-400'
                        : risk.net_score >= 10
                            ? 'text-orange-400'
                            : risk.net_score >= 5
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                }`}
            >
                {risk.net_score}
            </span>
        ),
    },
];

export const getControlColumns = (t: TranslateFn): Column<ControlSummary>[] => [
    {
        key: 'name',
        label: t('common:labels.name'),
        sortable: true,
        render: (control) => <span className="font-medium text-white">{control.name}</span>,
    },
    {
        key: 'description',
        label: t('common:labels.description'),
        sortable: false,
        render: (control) => (
            <span className="text-slate-400 text-xs line-clamp-2 max-w-xs">
                {control.description || t('common:fallbacks.not_available')}
            </span>
        ),
    },
    {
        key: 'control_owner_name',
        label: t('common:labels.owner'),
        sortable: true,
        render: (control) => (
            <span className="text-slate-300">{control.control_owner_name || t('common:fallbacks.not_available')}</span>
        ),
    },
    { key: 'control_form', label: t('common:labels.form'), sortable: true },
    { key: 'frequency', label: t('common:labels.frequency'), sortable: true },
    {
        key: 'status',
        label: t('common:labels.status'),
        sortable: true,
        render: (control) => (
            <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                    control.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
                }`}
            >
                {control.status}
            </span>
        ),
    },
];

export const getKriColumns = (t: TranslateFn): Column<KeyRiskIndicator>[] => [
    {
        key: 'metric_name',
        label: t('common:labels.name'),
        sortable: true,
        render: (kri) => <span className="font-medium text-white">{kri.metric_name}</span>,
    },
    {
        key: 'description',
        label: t('common:labels.description'),
        sortable: false,
        render: (kri) => (
            <span className="text-slate-400 text-xs line-clamp-2 max-w-xs">
                {kri.description || t('common:fallbacks.not_available')}
            </span>
        ),
    },
    {
        key: 'reporting_owner_name',
        label: t('common:labels.owner'),
        sortable: true,
        render: (kri) => (
            <span className="text-slate-300">
                {kri.reporting_owner_name || kri.risk_owner_name || t('common:fallbacks.not_available')}
            </span>
        ),
    },
    {
        key: 'lower_limit',
        label: t('common:labels.limits'),
        sortable: false,
        render: (kri) => (
            <span className="text-slate-400 text-xs font-mono">
                {kri.lower_limit.toLocaleString()} – {kri.upper_limit.toLocaleString()} {kri.unit}
            </span>
        ),
    },
    {
        key: 'current_value',
        label: t('common:labels.value'),
        sortable: true,
        render: (kri) => {
            const monitoring = getKriMonitoringMeta(kri.monitoring_status);
            return (
                <span className={`text-sm font-black ${monitoring.textClassName}`}>
                    {kri.current_value.toLocaleString()} <span className="text-slate-500 font-normal text-xs">{kri.unit}</span>
                </span>
            );
        },
    },
    {
        key: 'monitoring_status',
        label: t('common:labels.status'),
        sortable: true,
        render: (kri) => {
            const monitoring = getKriMonitoringMeta(kri.monitoring_status);
            const MonitoringIcon = monitoring.icon;
            return (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${monitoring.badgeClassName}`}>
                    <MonitoringIcon className="h-3 w-3" />
                    {t(monitoring.labelKey)}
                </span>
            );
        },
    },
    {
        key: 'frequency',
        label: t('common:labels.frequency'),
        sortable: true,
        render: (kri) => <span className="text-slate-400 capitalize">{kri.frequency || t('common:fallbacks.not_available')}</span>,
    },
];

export const getUserColumns = (t: TranslateFn): Column<DeptUser>[] => [
    {
        key: 'name',
        label: t('common:labels.name'),
        sortable: true,
        render: (u) => <span className="text-white font-medium">{u.name}</span>,
    },
    { key: 'email', label: t('common:labels.email'), sortable: true },
    {
        key: 'role_name',
        label: t('common:labels.role'),
        sortable: true,
        render: (u) => (
            <span className="px-2 py-0.5 rounded-md bg-white/10 text-slate-300 text-[10px] uppercase font-bold">
                {u.role_name || t('common:fallbacks.unknown')}
            </span>
        ),
    },
];

export function getResultIcon(result: string) {
    switch (result) {
        case 'passed':
            return <CheckCircle className="h-4 w-4 text-emerald-400" />;
        case 'failed':
            return <XCircle className="h-4 w-4 text-rose-400" />;
        case 'warning':
            return <AlertCircle className="h-4 w-4 text-amber-400" />;
        case 'not_applicable':
            return <MinusCircle className="h-4 w-4 text-slate-400" />;
        default:
            return <MinusCircle className="h-4 w-4 text-slate-400" />;
    }
}
