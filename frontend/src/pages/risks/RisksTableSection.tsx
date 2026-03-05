import { useMemo } from 'react';
import { AlertCircle, ChevronRight, Star } from 'lucide-react';

import {
    CategoryDrillDown,
    MiniHeatmap,
    Pagination,
    SortableTable,
    type SortDirection,
    type ViewMode,
} from '@/components/tables';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/hooks';
import { usePendingApprovalIds } from '@/hooks/usePendingApprovalIds';
import { useRiskThresholds, useRiskTypes } from '@/hooks/useRiskHubConfig';
import { buildRiskColumns, getRiskStatusColor } from '@/pages/risks/riskColumns';
import type { RiskSummary } from '@/types/risk';

import { getRiskGroupByField } from './risksPagePresentation';

interface RisksTableSectionProps {
    currentPage: number;
    errorKey: string | null;
    hasLoadedOnce: boolean;
    isLoading: boolean;
    items: RiskSummary[];
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    onRestoreRisk: (riskId: number) => void | Promise<void>;
    onRetry: () => void;
    onRowClick: (risk: RiskSummary) => void;
    onSortChange: (sortField: string | null, sortDirection: SortDirection) => void;
    sortDirection: SortDirection;
    sortField: string | null;
    totalCount: number;
    totalPages: number;
    viewMode: ViewMode;
}

export function RisksTableSection({
    currentPage,
    errorKey,
    hasLoadedOnce,
    isLoading,
    items,
    itemsPerPage,
    onPageChange,
    onRestoreRisk,
    onRetry,
    onRowClick,
    onSortChange,
    sortDirection,
    sortField,
    totalCount,
    totalPages,
    viewMode,
}: RisksTableSectionProps) {
    const { t } = useTranslation('risks');
    const { hasPermission } = useAuth();
    const pendingApprovalIds = usePendingApprovalIds('risk');
    const { getColor, getDisplayName, getInitials } = useRiskTypes();
    const { getScoreColor } = useRiskThresholds();

    const columns = useMemo(
        () =>
            buildRiskColumns({
                t,
                pendingApprovalIds,
                getColor,
                getDisplayName,
                getInitials,
                getScoreColor,
                hasPermission,
                handleRestoreRisk: (riskId, event) => {
                    event.stopPropagation();
                    return onRestoreRisk(riskId);
                },
            }),
        [
            getColor,
            getDisplayName,
            getInitials,
            getScoreColor,
            hasPermission,
            onRestoreRisk,
            pendingApprovalIds,
            t,
        ]
    );

    if (errorKey) {
        return (
            <div className="glass-card p-20 flex flex-col items-center justify-center text-center gap-4">
                <AlertCircle className="h-12 w-12 text-rose-500" />
                <div>
                    <p className="text-white font-bold text-xl">{t('errors.title')}</p>
                    <p className="text-slate-500 max-w-sm mx-auto">{t(errorKey)}</p>
                </div>
                <button type="button" onClick={onRetry} className="text-accent font-bold hover:underline">
                    {t('errors.try_again')}
                </button>
            </div>
        );
    }

    if (!hasLoadedOnce && isLoading) {
        return (
            <div className="glass-card !p-0 overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/5 bg-white/[0.02]">
                            {columns.map((column) => (
                                <th
                                    key={String(column.key)}
                                    className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500"
                                >
                                    {column.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {[...Array(itemsPerPage)].map((_, index) => (
                            <tr
                                key={`risks-skeleton-${index}`}
                                className="border-b border-white/5 animate-pulse"
                            >
                                <td className="px-6 py-4">
                                    <div className="h-4 w-24 bg-white/5 rounded" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-5 w-20 bg-white/5 rounded-md" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-6 w-10 bg-white/5 rounded-full mx-auto" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-6 w-10 bg-white/5 rounded-full mx-auto" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-6 w-10 bg-white/5 rounded-full mx-auto" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-5 w-16 bg-white/5 rounded-md" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-4 w-4 bg-white/5 rounded ml-auto" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    if (viewMode === 'all') {
        return (
            <>
                <SortableTable
                    data={items}
                    columns={columns}
                    keyExtractor={(risk) => risk.id}
                    onRowClick={onRowClick}
                    emptyMessage={t('empty_state.no_risks')}
                    sortKey={sortField}
                    sortDirection={sortDirection}
                    onSort={(key, direction) => onSortChange(direction ? key : null, direction)}
                />
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalCount}
                    itemsPerPage={itemsPerPage}
                    onPageChange={onPageChange}
                />
            </>
        );
    }

    return (
        <CategoryDrillDown
            data={items}
            groupBy={getRiskGroupByField(viewMode) as keyof RiskSummary}
            keyExtractor={(risk) => risk.id}
            getStats={(groupItems) => ({
                total: groupItems.length,
                activeCount: groupItems.filter((risk) => risk.status === 'active').length,
                highRiskCount: groupItems.filter((risk) => risk.net_score >= 16).length,
            })}
            renderTable={(groupItems) => (
                <SortableTable
                    data={groupItems}
                    columns={columns}
                    keyExtractor={(risk) => risk.id}
                    onRowClick={onRowClick}
                    emptyMessage={t('empty_state.no_risks')}
                />
            )}
            renderGroupExtra={(groupItems) => <MiniHeatmap risks={groupItems} />}
            renderItem={(risk) => (
                <div
                    onClick={() => onRowClick(risk)}
                    className="px-6 py-4 hover:bg-white/5 cursor-pointer flex items-center justify-between"
                >
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-white">{risk.name}</span>
                                {risk.is_priority && (
                                    <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                                )}
                            </div>
                            <span className="text-[10px] text-slate-500">{risk.process}</span>
                        </div>
                        <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getRiskStatusColor(
                                risk.status
                            )}`}
                        >
                            {risk.status}
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getScoreColor(
                                risk.gross_score
                            )}`}
                        >
                            G: {risk.gross_score}
                        </div>
                        <div
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getScoreColor(
                                risk.net_score
                            )}`}
                        >
                            N: {risk.net_score}
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                    </div>
                </div>
            )}
        />
    );
}
