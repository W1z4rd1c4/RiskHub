import { ArrowLeft, Building2, ChevronRight, Shield, User } from 'lucide-react';

import { Pagination, SortableTable, type Column, type ViewMode } from '@/components/tables';
import { getKriMonitoringMeta } from '@/lib/monitoringStatus';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { useTranslation } from '@/i18n/hooks';
import { formatMetricNumberValue } from '@/i18n/formatters';
import { buildRegisterTableModel } from '@/pages/shared/registerTablePresentation';
import type { CollectionGroup } from '@/types/collection';
import type { KeyRiskIndicator } from '@/types/kri';

import { formatKriGroupLabel } from './kriPagePresentation';

interface KRIsTableSectionProps {
    currentPage: number;
    errorKey: string | null;
    groups: CollectionGroup[];
    hasLoadedOnce: boolean;
    isLoading: boolean;
    items: KeyRiskIndicator[];
    itemsPerPage: number;
    onBackFromGroup: () => void;
    onPageChange: (page: number) => void;
    onRestoreKri: (kriId: number) => void | Promise<void>;
    onRetry: () => void;
    onRowClick: (kri: KeyRiskIndicator) => void;
    onSelectGroup: (groupValue: string, groupLabel: string) => void;
    selectedGroupLabel: string | null;
    selectedGroupValue: string | null;
    totalCount: number;
    totalPages: number;
    viewMode: ViewMode;
}

export function KRIsTableSection({
    currentPage,
    errorKey,
    groups,
    hasLoadedOnce,
    isLoading,
    items,
    itemsPerPage,
    onBackFromGroup,
    onPageChange,
    onRestoreKri,
    onRetry,
    onRowClick,
    onSelectGroup,
    selectedGroupLabel,
    selectedGroupValue,
    totalCount,
    totalPages,
    viewMode,
}: KRIsTableSectionProps) {
    const { t, i18n } = useTranslation(['kris', 'common', 'errorKeys']);

    const formatNumber = (value: number): string => formatMetricNumberValue(value, i18n.language);

    const columns: Column<KeyRiskIndicator>[] = [
        {
            key: 'metric_name',
            label: t('columns.metric'),
            sortable: true,
            render: (kri) => <span className="font-medium text-white">{kri.metric_name}</span>,
        },
        {
            key: 'current_value',
            label: t('columns.value'),
            sortable: true,
            render: (kri) => {
                const monitoring = getKriMonitoringMeta(kri.monitoring_status);
                return (
                    <span className={`font-black ${monitoring.textClassName}`}>
                        {formatNumber(kri.current_value)} <span className="text-slate-500 font-normal text-xs">{kri.unit}</span>
                    </span>
                );
            },
        },
        {
            key: 'lower_limit',
            label: t('columns.limits'),
            sortable: false,
            render: (kri) => (
                <span className="text-xs text-slate-500">
                    {formatNumber(kri.lower_limit)} - {formatNumber(kri.upper_limit)}
                </span>
            ),
        },
        {
            key: 'monitoring_status',
            label: t('columns.status'),
            sortable: true,
            render: (kri) => {
                const monitoring = getKriMonitoringMeta(kri.monitoring_status);
                const MonitoringIcon = monitoring.icon;
                return (
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase w-fit ${monitoring.badgeClassName}`}>
                        <MonitoringIcon className="h-3 w-3" />
                        {t(monitoring.labelKey)}
                    </span>
                );
            },
        },
        {
            key: 'risk_process',
            label: t('columns.risk'),
            sortable: true,
            render: (kri) => (
                <span className="text-white text-xs font-bold block truncate max-w-[150px]" title={kri.risk_process ?? undefined}>
                    {kri.risk_process || t('common:fallbacks.unknown_risk')}
                </span>
            ),
        },
        {
            key: 'risk_description',
            label: t('columns.description'),
            sortable: true,
            render: (kri) => (
                <span className="text-slate-400 text-xs font-medium block truncate max-w-[200px]" title={kri.risk_description ?? undefined}>
                    {kri.risk_description || t('common:fallbacks.not_available')}
                </span>
            ),
        },
        {
            key: 'actions',
            label: '',
            sortable: false,
            render: (kri) => (
                <div className="flex items-center justify-end gap-2">
                    {kri.is_archived && resolveCapabilityFlag(kri.capabilities, 'can_restore') && (
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                void onRestoreKri(kri.id);
                            }}
                            data-testid={`kri-unarchive-${kri.id}`}
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
    const emptyText = t('empty_state.no_kris');
    const groupLabel = (group: CollectionGroup) =>
        formatKriGroupLabel(group, {
            unlinkedVendor: t('grouping.unlinked_vendor'),
            uncategorized: t('common:fallbacks.not_available'),
            unknownDepartment: t('common:fallbacks.unassigned'),
            noProcess: t('common:fallbacks.not_available'),
            unknownRiskType: t('common:fallbacks.unknown_type'),
            unknownRisk: t('common:fallbacks.unknown_risk'),
        });
    const tableModel = buildRegisterTableModel({
        emptyText,
        groupPresentation: { groupLabel },
        groups,
        isLoading,
        pagination: { currentPage, itemsPerPage, totalItems: totalCount, totalPages },
        rows: items,
        rowKey: (kri) => kri.id,
    });

    if (errorKey) {
        return (
            <div className="glass-card p-20 flex flex-col items-center justify-center text-center gap-4">
                <p className="text-white font-bold text-xl">{t('errors.title')}</p>
                <p className="text-slate-500 max-w-sm mx-auto">
                    {errorKey.startsWith('errorKeys.')
                        ? t(errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                        : t(errorKey)}
                </p>
                <button type="button" onClick={onRetry} className="text-accent font-bold hover:underline">
                    {t('errors.try_again')}
                </button>
            </div>
        );
    }

    if (!hasLoadedOnce && isLoading) {
        return (
            <div className="glass-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            {columns.map((column) => (
                                <th key={String(column.key)} className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {column.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: itemsPerPage }, (_, index) => (
                            <tr key={`skeleton-${index}`} className="border-b border-white/5 animate-pulse">
                                <td className="px-6 py-4"><div className="h-4 w-32 bg-white/5 rounded" /></td>
                                <td className="px-6 py-4"><div className="h-4 w-16 bg-white/5 rounded" /></td>
                                <td className="px-6 py-4"><div className="h-4 w-20 bg-white/5 rounded" /></td>
                                <td className="px-6 py-4"><div className="h-5 w-16 bg-white/5 rounded-md" /></td>
                                <td className="px-6 py-4"><div className="h-4 w-8 bg-white/5 rounded mx-auto" /></td>
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
                    keyExtractor={(kri) => kri.id}
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

    if (selectedGroupValue) {
        const selectedGroup = tableModel.groupCards.find((group) => group.value === selectedGroupValue);
        const selectedLabel =
            selectedGroupLabel || selectedGroup?.label || t('empty.unknown_group', { ns: 'common' });
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBackFromGroup}
                        className="flex items-center gap-2 px-4 py-2 glass rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        {t('common:actions.back')}
                    </button>
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-white">{selectedLabel}</h3>
                    </div>
                </div>
                <SortableTable
                    data={tableModel.rows}
                    columns={columns}
                    keyExtractor={(kri) => kri.id}
                    onRowClick={onRowClick}
                    emptyMessage={t('empty_state.no_group')}
                />
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalCount}
                    itemsPerPage={itemsPerPage}
                    onPageChange={onPageChange}
                />
            </div>
        );
    }

    if (groups.length === 0) {
        return (
            <div className="glass-card text-center py-12">
                <p className="text-slate-400">{t('empty.no_data_available', { ns: 'common' })}</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tableModel.groupCards.map((card) => {
                const group = card.group;
                return (
                    <button
                        key={card.value}
                        onClick={() => onSelectGroup(card.value, card.label)}
                        className="glass-card group text-left hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 transition-all duration-300"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white group-hover:text-accent transition-colors">
                                {card.label}
                            </h3>
                            <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-accent group-hover:translate-x-1 transition-all" />
                        </div>

                        {viewMode === 'risk' && group.meta && (
                            <div className="space-y-3 pb-2 border-b border-white/5 mb-4">
                                <div className="grid grid-cols-2 gap-y-2">
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate">
                                        <Shield className="h-3 w-3 text-accent shrink-0" />
                                        <span className="truncate">{String(group.meta.risk_type || t('common:fallbacks.unknown_type'))}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate">
                                        <Building2 className="h-3 w-3 text-accent shrink-0" />
                                        <span className="truncate">{String(group.meta.risk_department_name || t('common:fallbacks.unassigned'))}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate">
                                        <User className="h-3 w-3 text-accent shrink-0" />
                                        <span className="truncate">{String(group.meta.risk_owner_name || t('common:fallbacks.no_owner'))}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-6">
                            <div>
                                <p className="text-3xl font-black text-white">{card.count}</p>
                                <p className="text-xs text-slate-500 uppercase tracking-wider">Items</p>
                            </div>
                            {card.showHighlighted && (
                                    <div>
                                        <p className="text-xl font-bold text-rose-400">{card.highlightedCount}</p>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">{t('tables.high_risk', { ns: 'common' })}</p>
                                    </div>
                                )}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
