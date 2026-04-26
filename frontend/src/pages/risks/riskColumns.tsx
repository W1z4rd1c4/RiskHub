import type { MouseEvent } from 'react';
import { AlertCircle, ChevronRight, Lock, Star } from 'lucide-react';

import { RiskTypeBadge } from '@/components/ui/RiskTypeBadge';
import type { Column } from '@/components/tables/SortableTable';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { RiskStatus, RiskSummary } from '@/types/risk';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type BuildRiskColumnsParams = {
    t: TranslateFn;
    pendingApprovalIds: Set<number>;
    getColor: (riskType: string) => string;
    getDisplayName: (riskType: string) => string;
    getInitials: (riskType: string) => string;
    getScoreColor: (score: number) => string;
    handleRestoreRisk: (riskId: number, event: MouseEvent) => void | Promise<void>;
};

export function getRiskStatusColor(status: RiskStatus): string {
    switch (status) {
        case 'active':
            return 'text-emerald-400 bg-emerald-400/10';
        case 'emerging':
            return 'text-amber-400 bg-amber-400/10';
        case 'archived':
            return 'text-rose-400 bg-rose-400/10';
        default:
            return 'text-slate-400 bg-slate-400/10';
    }
}

export function buildRiskColumns({
    t,
    pendingApprovalIds,
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
                        <span className="text-sm font-bold text-white">{risk.name}</span>
                        {risk.is_priority && <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />}
                        {pendingApprovalIds.has(risk.id) && (
                            <div
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-amber-400/10 text-amber-400 border border-amber-400/20"
                                title={t('columns.pending_tooltip')}
                            >
                                <Lock className="h-2.5 w-2.5" />
                                {t('columns.pending')}
                            </div>
                        )}
                    </div>
                    <span className="text-[10px] text-slate-500">{risk.process}</span>
                </div>
            ),
        },
        {
            key: 'category',
            label: t('columns.category'),
            sortable: true,
            render: (risk) => <span className="text-xs font-medium text-slate-400">{risk.category || '—'}</span>,
        },
        {
            key: 'description',
            label: t('columns.description'),
            sortable: true,
            render: (risk) => {
                const text = risk.description || '';
                const isLong = text.length > 20;
                return (
                    <div className="relative group/desc">
                        <span
                            className="text-xs text-slate-400 cursor-help border-b border-dotted border-slate-600 hover:border-slate-400 transition-colors"
                            title={text}
                        >
                            {isLong ? `${text.slice(0, 20)}...` : text}
                        </span>
                    </div>
                );
            },
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
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getScoreColor(risk.gross_score)}`}>
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
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getScoreColor(risk.net_score)}`}>
                        {risk.net_score}
                    </span>
                </div>
            ),
        },
        {
            key: 'status',
            label: t('fields.status'),
            sortable: true,
            render: (risk) => (
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getRiskStatusColor(risk.status)}`}>
                    {risk.status}
                </span>
            ),
        },
        {
            key: 'control_count',
            label: t('columns.controls'),
            sortable: true,
            className: 'text-center',
            render: (risk) => {
                const count = risk.control_count || 0;
                if (count === 0) return <span className="text-slate-600 text-[10px]">—</span>;
                return (
                    <div className="flex justify-center">
                        <div className="px-2 py-0.5 rounded-md text-[10px] font-bold text-blue-400 bg-blue-400/10">
                            {count} {count === 1 ? 'Ctrl' : 'Ctrls'}
                        </div>
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

                if (count === 0) return <span className="text-slate-600 text-[10px]">—</span>;

                return (
                    <div className="flex justify-center">
                        <div
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 ${
                                hasBreach ? 'text-rose-400 bg-rose-400/10' : 'text-emerald-400 bg-emerald-400/10'
                            }`}
                        >
                            {hasBreach && <AlertCircle className="h-3 w-3" />}
                            {count} {count === 1 ? 'KRI' : 'KRIs'}
                        </div>
                    </div>
                );
            },
        },
        {
            key: 'actions',
            label: '',
            render: (risk) => (
                <div className="text-right flex items-center justify-end gap-2">
                    {risk.status === 'archived' &&
                        resolveCapabilityFlag(risk.capabilities, 'can_restore') && (
                        <button
                            onClick={(e) => handleRestoreRisk(risk.id, e)}
                            data-testid={`risk-unarchive-${risk.id}`}
                            className="px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-[10px] font-black uppercase tracking-wider"
                        >
                            {t('actions.unarchive')}
                        </button>
                    )}
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                </div>
            ),
        },
    ];
}
