import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';

import {
    CollectionGroupDrillDown,
    Pagination,
    SortableTable,
    type SortDirection,
    type ViewMode,
} from '@/components/tables';
import { useTranslation } from '@/i18n/hooks';
import { usePendingApprovalIds } from '@/hooks/usePendingApprovalIds';
import { useRiskThresholds, useRiskTypes } from '@/hooks/useRiskHubConfig';
import { buildRiskColumns } from '@/pages/risks/riskColumns';
import type { CollectionGroup } from '@/types/collection';
import type { RiskSummary } from '@/types/risk';

import { formatRiskGroupLabel } from './risksPagePresentation';

interface RisksTableSectionProps {
    currentPage: number;
    errorKey: string | null;
    hasLoadedOnce: boolean;
    groups: CollectionGroup[];
    isLoading: boolean;
    items: RiskSummary[];
    itemsPerPage: number;
    onBackFromGroup: () => void;
    onPageChange: (page: number) => void;
    onRestoreRisk: (riskId: number) => void | Promise<void>;
    onRetry: () => void;
    onRowClick: (risk: RiskSummary) => void;
    onSelectGroup: (groupValue: string, groupLabel: string) => void;
    onSortChange: (sortField: string | null, sortDirection: SortDirection) => void;
    sortDirection: SortDirection;
    sortField: string | null;
    totalCount: number;
    totalPages: number;
    selectedGroupLabel: string | null;
    selectedGroupValue: string | null;
    viewMode: ViewMode;
}

export function RisksTableSection({
    currentPage,
    errorKey,
    hasLoadedOnce,
    groups,
    isLoading,
    items,
    itemsPerPage,
    onBackFromGroup,
    onPageChange,
    onRestoreRisk,
    onRetry,
    onRowClick,
    onSelectGroup,
    onSortChange,
    sortDirection,
    sortField,
    totalCount,
    totalPages,
    selectedGroupLabel,
    selectedGroupValue,
    viewMode,
}: RisksTableSectionProps) {
    const { t } = useTranslation('risks');
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
                        {Array.from({ length: itemsPerPage }, (_, index) => (
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
        <CollectionGroupDrillDown
            groups={groups}
            selectedGroupValue={selectedGroupValue}
            selectedGroupLabel={selectedGroupLabel}
            items={items}
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            itemsPerPage={itemsPerPage}
            onPageChange={onPageChange}
            onBack={onBackFromGroup}
            onSelectGroup={onSelectGroup}
            groupLabel={(group) =>
                formatRiskGroupLabel(group, {
                    unlinkedVendor: t('grouping.unlinked_vendor'),
                    uncategorized: t('common:fallbacks.not_available'),
                    unknownDepartment: t('common:fallbacks.unassigned'),
                    noProcess: t('common:fallbacks.not_available'),
                    unknownRiskType: t('common:fallbacks.unknown_type'),
                })
            }
            emptyMessage={t('empty_state.no_risks')}
            renderTable={(groupItems) => (
                <SortableTable
                    data={groupItems}
                    columns={columns}
                    keyExtractor={(risk) => risk.id}
                    onRowClick={onRowClick}
                    emptyMessage={t('empty_state.no_risks')}
                />
            )}
        />
    );
}
