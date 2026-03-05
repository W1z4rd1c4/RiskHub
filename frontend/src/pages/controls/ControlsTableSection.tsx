import { useMemo } from 'react';
import { AlertCircle, Building2, Calendar, ChevronRight, Lock, Shield, User } from 'lucide-react';

import {
    CategoryDrillDown,
    Pagination,
    SortableTable,
    type Column,
    type ViewMode,
} from '@/components/tables';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/hooks';
import { usePendingApprovalIds } from '@/hooks/usePendingApprovalIds';
import { ControlStatus, type ControlSummary } from '@/types/control';

import {
    getControlGroupByField,
    getControlRiskLevelColor,
    getControlStatusColor,
} from './controlsPagePresentation';

interface ControlsTableSectionProps {
    currentPage: number;
    errorKey: string | null;
    hasLoadedOnce: boolean;
    isLoading: boolean;
    items: ControlSummary[];
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    onRestoreControl: (controlId: number) => void | Promise<void>;
    onRetry: () => void;
    onRowClick: (control: ControlSummary) => void;
    totalCount: number;
    totalPages: number;
    viewMode: ViewMode;
}

export function ControlsTableSection({
    currentPage,
    errorKey,
    hasLoadedOnce,
    isLoading,
    items,
    itemsPerPage,
    onPageChange,
    onRestoreControl,
    onRetry,
    onRowClick,
    totalCount,
    totalPages,
    viewMode,
}: ControlsTableSectionProps) {
    const { t } = useTranslation('controls');
    const { hasPermission } = useAuth();
    const pendingApprovalIds = usePendingApprovalIds('control');

    const columns = useMemo<Column<ControlSummary>[]>(
        () => [
            {
                key: 'name',
                label: t('columns.name'),
                sortable: true,
                render: (control) => (
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{control.name}</span>
                        {pendingApprovalIds.has(control.id) && (
                            <div
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-amber-400/10 text-amber-400 border border-amber-400/20"
                                title={t('columns.pending_changes_title')}
                            >
                                <Lock className="h-2.5 w-2.5" />
                                {t('columns.pending')}
                            </div>
                        )}
                    </div>
                ),
            },
            {
                key: 'department_name',
                label: t('columns.department'),
                sortable: true,
                render: (control) => (
                    <span className="text-xs font-medium text-slate-300">
                        {control.department_name || t('common:fallbacks.unassigned')}
                    </span>
                ),
            },
            {
                key: 'frequency',
                label: t('columns.frequency'),
                sortable: true,
                render: (control) => (
                    <div className="flex items-center gap-2 text-xs text-slate-400 capitalize">
                        <Calendar className="h-3 w-3 text-accent" />
                        {control.frequency}
                    </div>
                ),
            },
            {
                key: 'risk_level',
                label: t('columns.risk_level'),
                sortable: true,
                className: 'text-center',
                render: (control) => (
                    <div className="flex justify-center">
                        <div
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getControlRiskLevelColor(
                                control.risk_level
                            )}`}
                        >
                            {control.risk_level} / 5
                        </div>
                    </div>
                ),
            },
            {
                key: 'status',
                label: t('columns.status'),
                sortable: true,
                render: (control) => (
                    <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getControlStatusColor(
                            control.status
                        )}`}
                    >
                        {control.status}
                    </span>
                ),
            },
            {
                key: 'actions',
                label: '',
                render: (control) => (
                    <div className="text-right flex items-center justify-end gap-2">
                        {control.status === ControlStatus.ARCHIVED &&
                            hasPermission('controls', 'delete') && (
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        void onRestoreControl(control.id);
                                    }}
                                    data-testid={`control-unarchive-${control.id}`}
                                    className="px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-[10px] font-black uppercase tracking-wider"
                                >
                                    {t('actions.unarchive')}
                                </button>
                            )}
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                    </div>
                ),
            },
        ],
        [hasPermission, onRestoreControl, pendingApprovalIds, t]
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
                                key={`controls-skeleton-${index}`}
                                className="border-b border-white/5 animate-pulse"
                            >
                                <td className="px-6 py-4">
                                    <div className="h-4 w-40 bg-white/5 rounded" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-4 w-24 bg-white/5 rounded" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-4 w-20 bg-white/5 rounded" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-6 w-12 bg-white/5 rounded-full mx-auto" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-6 w-16 bg-white/5 rounded-full" />
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
                    keyExtractor={(control) => control.id}
                    onRowClick={onRowClick}
                    emptyMessage={t('empty_state.no_controls')}
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
            groupBy={getControlGroupByField(viewMode) as keyof ControlSummary}
            hideTotal={viewMode === 'risk'}
            hideHighRisk={viewMode === 'risk'}
            renderBody={(groupItems) => {
                if (viewMode !== 'risk' || groupItems.length === 0) {
                    return null;
                }

                const info = groupItems[0];
                return (
                    <div className="space-y-3 pb-2 border-b border-white/5">
                        <div className="grid grid-cols-2 gap-y-2">
                            <div
                                className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate"
                                title={`${t('common:labels.type')}: ${
                                    info.risk_type || t('common:fallbacks.not_available')
                                }`}
                            >
                                <Shield className="h-3 w-3 text-accent shrink-0" />
                                <span className="truncate">
                                    {info.risk_type || t('common:fallbacks.unknown_type')}
                                </span>
                            </div>
                            <div
                                className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate"
                                title={`${t('common:labels.department')}: ${
                                    info.risk_department_name || t('common:fallbacks.not_available')
                                }`}
                            >
                                <Building2 className="h-3 w-3 text-accent shrink-0" />
                                <span className="truncate">
                                    {info.risk_department_name || t('common:fallbacks.unassigned')}
                                </span>
                            </div>
                            <div
                                className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate"
                                title={`${t('common:labels.owner')}: ${
                                    info.risk_owner_name || t('common:fallbacks.not_available')
                                }`}
                            >
                                <User className="h-3 w-3 text-accent shrink-0" />
                                <span className="truncate">
                                    {info.risk_owner_name || t('common:fallbacks.no_owner')}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            }}
            keyExtractor={(control) => control.id}
            getStats={(groupItems) => ({
                total: groupItems.length,
                activeCount: groupItems.filter((control) => control.status === ControlStatus.ACTIVE).length,
                highRiskCount: groupItems.filter((control) => control.risk_level >= 4).length,
            })}
            renderTable={(groupItems) => (
                <SortableTable
                    data={groupItems}
                    columns={columns}
                    keyExtractor={(control) => control.id}
                    onRowClick={onRowClick}
                    emptyMessage={t('empty_state.no_controls')}
                />
            )}
            renderItem={(control) => (
                <div
                    onClick={() => onRowClick(control)}
                    className="px-6 py-4 hover:bg-white/5 cursor-pointer flex items-center justify-between"
                >
                    <div className="flex-1 min-w-0 mr-4">
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-white">{control.name}</span>
                            <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getControlStatusColor(
                                    control.status
                                )}`}
                            >
                                {control.status}
                            </span>
                        </div>
                        {control.description && (
                            <p className="text-xs text-slate-500 mt-1 truncate max-w-lg">
                                {control.description}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                        <div className="flex items-center gap-2 text-xs text-slate-400 capitalize">
                            <Calendar className="h-3 w-3 text-accent" />
                            {control.frequency}
                        </div>
                        <div
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getControlRiskLevelColor(
                                control.risk_level
                            )}`}
                        >
                            {control.risk_level}/5
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                    </div>
                </div>
            )}
        />
    );
}
