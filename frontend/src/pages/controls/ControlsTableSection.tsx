import { useMemo } from 'react';
import { AlertCircle, Building2, Calendar, ChevronRight, Lock, Shield, User } from 'lucide-react';

import {
    CollectionGroupDrillDown,
    Pagination,
    SortableTable,
    type Column,
    type ViewMode,
} from '@/components/tables';
import { useTranslation } from '@/i18n/hooks';
import { usePendingApprovalIds } from '@/hooks/usePendingApprovalIds';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { getControlMonitoringMeta } from '@/lib/monitoringStatus';
import { buildRegisterTableModel } from '@/pages/shared/registerTablePresentation';
import type { CollectionGroup } from '@/types/collection';
import type { ControlSummary } from '@/types/control';

import {
    ARCHIVED_CONTROL_BADGE_CLASS_NAME,
    formatControlGroupLabel,
    getControlRiskLevelColor,
} from './controlsPagePresentation';

interface ControlsTableSectionProps {
    currentPage: number;
    errorKey: string | null;
    groups: CollectionGroup[];
    hasLoadedOnce: boolean;
    isLoading: boolean;
    items: ControlSummary[];
    itemsPerPage: number;
    onBackFromGroup: () => void;
    onPageChange: (page: number) => void;
    onRestoreControl: (controlId: number) => void | Promise<void>;
    onRetry: () => void;
    onRowClick: (control: ControlSummary) => void;
    onSelectGroup: (groupValue: string, groupLabel: string) => void;
    selectedGroupLabel: string | null;
    selectedGroupValue: string | null;
    totalCount: number;
    totalPages: number;
    viewMode: ViewMode;
}

export function ControlsTableSection({
    currentPage,
    errorKey,
    groups,
    hasLoadedOnce,
    isLoading,
    items,
    itemsPerPage,
    onBackFromGroup,
    onPageChange,
    onRestoreControl,
    onRetry,
    onRowClick,
    onSelectGroup,
    selectedGroupLabel,
    selectedGroupValue,
    totalCount,
    totalPages,
    viewMode,
}: ControlsTableSectionProps) {
    const { t } = useTranslation('controls');
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
                render: (control) => {
                    const monitoring = getControlMonitoringMeta(control.monitoring_status);
                    const MonitoringIcon = monitoring.icon;
                    return (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${monitoring.badgeClassName}`}
                            >
                                <MonitoringIcon className="h-3 w-3" />
                                {t(monitoring.labelKey)}
                            </span>
                            {control.is_archived && (
                                <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${ARCHIVED_CONTROL_BADGE_CLASS_NAME}`}
                                >
                                    {t('status.archived')}
                                </span>
                            )}
                        </div>
                    );
                },
            },
            {
                key: 'actions',
                label: '',
                render: (control) => (
                    <div className="text-right flex items-center justify-end gap-2">
                        {control.is_archived &&
                            resolveCapabilityFlag(control.capabilities, 'can_restore') && (
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
        [onRestoreControl, pendingApprovalIds, t]
    );
    const emptyText = t('empty_state.no_controls');
    const groupLabel = (group: CollectionGroup) =>
        formatControlGroupLabel(group, {
            unlinkedVendor: t('grouping.unlinked_vendor'),
            uncategorized: t('form.labels.uncategorized'),
            unknownDepartment: t('common:fallbacks.unassigned'),
            noProcess: t('common:fallbacks.not_available'),
            unknownRiskType: t('common:fallbacks.unknown_type'),
            unknownRisk: t('common:fallbacks.unknown_risk'),
            controlForm: (value) => t(`form.${value}`, value),
        });
    const tableModel = buildRegisterTableModel({
        emptyText,
        groupPresentation: {
            groupLabel,
            hideActive: viewMode === 'risk',
            hideHighlighted: viewMode === 'risk',
        },
        groups,
        isLoading,
        pagination: { currentPage, itemsPerPage, totalItems: totalCount, totalPages },
        rows: items,
        rowKey: (control) => control.id,
    });

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
                    data={tableModel.rows}
                    columns={columns}
                    keyExtractor={(control) => control.id}
                    onRowClick={onRowClick}
                    emptyMessage={tableModel.emptyText}
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
            hideActive={viewMode === 'risk'}
            hideHighlighted={viewMode === 'risk'}
            groupLabel={groupLabel}
            renderGroupBody={(group) => {
                if (viewMode !== 'risk') {
                    return null;
                }
                return (
                    <div className="space-y-3 pb-2 border-b border-white/5">
                        <div className="grid grid-cols-2 gap-y-2">
                            <div
                                className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate"
                                title={`${t('common:labels.type')}: ${
                                    String(group.meta?.risk_type || '') || t('common:fallbacks.not_available')
                                }`}
                            >
                                <Shield className="h-3 w-3 text-accent shrink-0" />
                                <span className="truncate">
                                    {String(group.meta?.risk_type || '') || t('common:fallbacks.unknown_type')}
                                </span>
                            </div>
                            <div
                                className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate"
                                title={`${t('common:labels.department')}: ${
                                    String(group.meta?.risk_department_name || '') || t('common:fallbacks.not_available')
                                }`}
                            >
                                <Building2 className="h-3 w-3 text-accent shrink-0" />
                                <span className="truncate">
                                    {String(group.meta?.risk_department_name || '') || t('common:fallbacks.unassigned')}
                                </span>
                            </div>
                            <div
                                className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate"
                                title={`${t('common:labels.owner')}: ${
                                    String(group.meta?.risk_owner_name || '') || t('common:fallbacks.not_available')
                                }`}
                            >
                                <User className="h-3 w-3 text-accent shrink-0" />
                                <span className="truncate">
                                    {String(group.meta?.risk_owner_name || '') || t('common:fallbacks.no_owner')}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            }}
            emptyMessage={tableModel.emptyText}
            renderTable={(groupItems) => (
                <SortableTable
                    data={groupItems}
                    columns={columns}
                    keyExtractor={(control) => control.id}
                    onRowClick={onRowClick}
                    emptyMessage={tableModel.emptyText}
                />
            )}
        />
    );
}
