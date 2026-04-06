import { useMemo } from 'react';
import { AlertCircle, Building2, ChevronRight, User } from 'lucide-react';

import {
    CategoryDrillDown,
    Pagination,
    SortableTable,
    type Column,
    type SortDirection,
    type ViewMode,
} from '@/components/tables';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/i18n/hooks';
import type { Vendor, VendorListParams } from '@/types/vendor';

import { buildVendorGroupedRows, type VendorGroupedRow } from './vendorsPagePresentation';

function scorePill(score: number) {
    if (score >= 5) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
    if (score >= 4) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
    if (score >= 3) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    if (score >= 2) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
}

interface VendorsTableSectionProps {
    currentPage: number;
    errorKey: string | null;
    hasLoadedOnce: boolean;
    isLoading: boolean;
    items: Vendor[];
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    onRestoreVendor: (vendorId: number) => void | Promise<void>;
    onRetry: () => void;
    onRowClick: (vendor: Vendor) => void;
    onSortChange: (
        sortField: VendorListParams['sort_by'] | null,
        sortDirection: SortDirection,
    ) => void;
    sortDirection: SortDirection;
    sortField: VendorListParams['sort_by'] | null;
    totalCount: number;
    totalPages: number;
    viewMode: ViewMode;
}

export function VendorsTableSection({
    currentPage,
    errorKey,
    hasLoadedOnce,
    isLoading,
    items,
    itemsPerPage,
    onPageChange,
    onRestoreVendor,
    onRetry,
    onRowClick,
    onSortChange,
    sortDirection,
    sortField,
    totalCount,
    totalPages,
    viewMode,
}: VendorsTableSectionProps) {
    const { t } = useTranslation('vendors');
    const { hasPermission } = usePermissions();

    const columns = useMemo<Column<Vendor>[]>(
        () => [
            {
                key: 'name',
                label: t('columns.name'),
                sortable: true,
                render: (vendor) => (
                    <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-bold text-white">{vendor.name}</span>
                        <span className="text-[10px] text-slate-500">
                            {vendor.process || t('grouping.no_process')}
                        </span>
                    </div>
                ),
            },
            {
                key: 'department_name',
                label: t('columns.department'),
                sortable: true,
                render: (vendor) => (
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                        <Building2 className="h-3 w-3 text-accent" />
                        <span>{vendor.department_name || t('labels.unassigned')}</span>
                    </div>
                ),
            },
            {
                key: 'outsourcing_owner_name',
                label: t('columns.owner'),
                sortable: false,
                render: (vendor) => (
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                        <User className="h-3 w-3 text-accent" />
                        <span>{vendor.outsourcing_owner_name || '—'}</span>
                    </div>
                ),
            },
            {
                key: 'vendor_type',
                label: t('columns.type'),
                sortable: true,
                render: (vendor) => (
                    <span className="text-xs font-medium text-slate-400">
                        {t(`type.${vendor.vendor_type}`, vendor.vendor_type)}
                    </span>
                ),
            },
            {
                key: 'risk_score_1_5',
                label: t('columns.risk_score'),
                sortable: true,
                className: 'text-center',
                render: (vendor) => (
                    <div className="flex justify-center">
                        <div
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${scorePill(
                                vendor.risk_score_1_5
                            )}`}
                        >
                            {vendor.risk_score_1_5} / 5
                        </div>
                    </div>
                ),
            },
            {
                key: 'status',
                label: t('columns.status'),
                sortable: true,
                render: (vendor) => (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase text-slate-300 bg-white/5 border border-white/10">
                        {t(`status.${vendor.status}`, vendor.status)}
                    </span>
                ),
            },
            {
                key: 'id',
                label: '',
                sortable: false,
                render: (vendor) => (
                    <div className="flex items-center justify-end gap-2">
                        {vendor.status === 'inactive' && hasPermission('vendors', 'delete') && (
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    void onRestoreVendor(vendor.id);
                                }}
                                data-testid={`vendor-unarchive-${vendor.id}`}
                                className="px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-[10px] font-black uppercase tracking-wider"
                            >
                                {t('actions.unarchive')}
                            </button>
                        )}
                        <ChevronRight className="h-4 w-4 text-slate-500 ml-auto" />
                    </div>
                ),
            },
        ],
        [hasPermission, onRestoreVendor, t]
    );

    const groupedRows = useMemo(
        () =>
            buildVendorGroupedRows(items, viewMode, {
                noProcess: t('grouping.no_process'),
                typeLabel: (value) => t(`type.${value}`, value),
                unassigned: t('labels.unassigned'),
                unlinkedRisk: t('grouping.unlinked_risk'),
                doraRelevant: t('flags.dora_relevant'),
                supportsCoreFunction: t('flags.supports_core_function'),
                significantVendor: t('flags.significant_vendor'),
                insignificantVendor: t('grouping.insignificant_vendor'),
            }),
        [items, t, viewMode]
    );

    if (errorKey) {
        return (
            <div className="glass-card p-20 flex flex-col items-center justify-center text-center gap-4">
                <AlertCircle className="h-12 w-12 text-rose-500" />
                <div>
                    <p className="text-white font-bold text-xl">{t('errors.title')}</p>
                    <p className="text-slate-500 max-w-sm mx-auto">{t(errorKey, { ns: 'errorKeys' })}</p>
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
                            {columns.map((col) => (
                                <th
                                    key={String(col.key)}
                                    className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500"
                                >
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: itemsPerPage }, (_, i) => (
                            <tr key={`vendor-skeleton-${i}`} className="border-b border-white/5 animate-pulse">
                                <td className="px-6 py-4">
                                    <div className="h-4 w-40 bg-white/5 rounded" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-4 w-24 bg-white/5 rounded" />
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
                    keyExtractor={(vendor) => vendor.id}
                    onRowClick={onRowClick}
                    emptyMessage={t('empty_state.no_vendors')}
                    onSort={(key, direction) =>
                        onSortChange((direction ? key : null) as VendorListParams['sort_by'] | null, direction)
                    }
                    sortKey={sortField}
                    sortDirection={sortDirection}
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
            key={`${viewMode}:${items.length}`}
            data={groupedRows}
            groupBy="groupValue"
            keyExtractor={(row) => row.rowId}
            getStats={(groupItems) => ({ total: groupItems.length })}
            renderTable={(groupItems: VendorGroupedRow[]) => (
                <SortableTable
                    data={groupItems}
                    columns={columns.map<Column<VendorGroupedRow>>((column) => ({
                        ...column,
                        sortable: false,
                        render: (row, index) => {
                            if (column.render) {
                                return column.render(row.vendor, index);
                            }
                            return String(row.vendor[column.key as keyof Vendor] ?? '');
                        },
                    }))}
                    keyExtractor={(row) => row.rowId}
                    onRowClick={(row) => onRowClick(row.vendor)}
                    emptyMessage={t('empty_state.no_vendors')}
                />
            )}
            renderItem={(row) => row.vendor.name}
        />
    );
}
