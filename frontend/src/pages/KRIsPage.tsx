import { useState, useEffect, useCallback, useMemo, useRef, type MouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { Plus, Search, RefreshCw, ChevronRight, User, Shield, Building2, Download } from 'lucide-react';
import { kriApi } from '@/services/kriApi';
import { reportApi } from '@/services/reportApi';
import { PermissionGate } from '@/components/PermissionGate';
import { ViewSwitcher, SortableTable, Pagination, CategoryDrillDown } from '@/components/tables';
import type { Column, ViewMode } from '@/components/tables';
import { KRI_MONITORING_FILTER_VALUES, getKriMonitoringMeta } from '@/lib/monitoringStatus';
import type { KeyRiskIndicator, KRIMonitoringStatus, KRITimelinessStatus } from '@/types/kri';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_LIST_PAGE_SIZE, GROUPED_VIEW_FETCH_PAGE_SIZE, LIST_SEARCH_DEBOUNCE_MS } from '@/constants/list';
import { ExportDialog, type ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

type StatusFilter = 'all' | 'archived' | KRIMonitoringStatus;
type TimelinessFilter = KRITimelinessStatus | null;
interface KriGroupedRow {
    groupValue: string;
    kri: KeyRiskIndicator;
    rowId: string;
}

const TIMELINESS_FILTER_VALUES: KRITimelinessStatus[] = ['due_soon'];
const ARCHIVED_ROUTE_VALUE = 'archived';
const ARCHIVED_STATUS_PARAM = 'status';

function isMonitoringStatus(value: string | null): value is KRIMonitoringStatus {
    return value !== null && (KRI_MONITORING_FILTER_VALUES as readonly string[]).includes(value);
}

function isTimelinessStatus(value: string | null): value is KRITimelinessStatus {
    return value !== null && TIMELINESS_FILTER_VALUES.includes(value as KRITimelinessStatus);
}

function readKriRouteFilters(searchParams: URLSearchParams): {
    statusFilter: StatusFilter;
    timelinessFilter: TimelinessFilter;
} {
    const timeliness = searchParams.get('timeliness_status');
    if (isTimelinessStatus(timeliness)) {
        return { statusFilter: 'all', timelinessFilter: timeliness };
    }
    const monitoringStatus = searchParams.get('monitoring_status');
    if (isMonitoringStatus(monitoringStatus)) {
        return { statusFilter: monitoringStatus, timelinessFilter: null };
    }
    if (searchParams.get(ARCHIVED_STATUS_PARAM) === ARCHIVED_ROUTE_VALUE) {
        return { statusFilter: 'archived', timelinessFilter: null };
    }
    return { statusFilter: 'all', timelinessFilter: null };
}

function buildKriListParams(params: {
    currentPage: number;
    limit: number;
    search: string;
    statusFilter: StatusFilter;
    timelinessFilter: TimelinessFilter;
}) {
    const trimmedSearch = params.search.trim();

    return {
        includeArchived: params.statusFilter === 'archived',
        monitoringStatus:
            !params.timelinessFilter && params.statusFilter !== 'all' && params.statusFilter !== 'archived'
                ? params.statusFilter
                : undefined,
        search: trimmedSearch || undefined,
        timelinessStatus: params.timelinessFilter ?? undefined,
        page: params.currentPage,
        size: params.limit,
    };
}

function buildKriExportFilters(params: {
    search: string;
    statusFilter: StatusFilter;
    timelinessFilter: TimelinessFilter;
}) {
    const search = params.search.trim() || null;

    if (params.timelinessFilter) {
        return {
            status: null,
            monitoringStatus: null,
            search,
            timelinessStatus: params.timelinessFilter,
        };
    }

    if (params.statusFilter !== 'all' && params.statusFilter !== 'archived') {
        return {
            status: null,
            monitoringStatus: params.statusFilter,
            search,
            timelinessStatus: null,
        };
    }

    return {
        status: params.statusFilter === 'archived' ? 'archived' : null,
        monitoringStatus: null,
        search,
        timelinessStatus: null,
    };
}

function buildKriVendorGroupedRows(
    items: KeyRiskIndicator[],
    labels: { unlinkedVendor: string },
): KriGroupedRow[] {
    return items.flatMap((kri) => {
        const vendors = kri.linked_vendors ?? [];
        if (vendors.length === 0) {
            return [
                {
                    groupValue: labels.unlinkedVendor,
                    kri,
                    rowId: `${labels.unlinkedVendor}:${kri.id}`,
                },
            ];
        }

        return vendors.map((vendor) => ({
            groupValue: vendor.name,
            kri,
            rowId: `${vendor.id}:${kri.id}`,
        }));
    });
}

export function KRIsPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [kris, setKris] = useState<KeyRiskIndicator[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const { t } = useTranslation('kris');
    const { hasPermission } = useAuth();
    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, LIST_SEARCH_DEBOUNCE_MS);
    const latestRequestIdRef = useRef(0);
    const { statusFilter, timelinessFilter } = readKriRouteFilters(searchParams);
    const isArchivedOnly = statusFilter === 'archived';
    const groupedVendorRows = useMemo(
        () => buildKriVendorGroupedRows(kris, { unlinkedVendor: t('grouping.unlinked_vendor') }),
        [kris, t],
    );

    const fetchKRIs = useCallback(async () => {
        const requestId = ++latestRequestIdRef.current;
        setIsLoading(true);

        try {
            const isLatestRequest = () => requestId === latestRequestIdRef.current;
            const listParams = buildKriListParams({
                currentPage,
                limit,
                search: debouncedSearch,
                statusFilter,
                timelinessFilter,
            });

            const fetchAllMatchingKRIs = async () => {
                const items: KeyRiskIndicator[] = [];
                let page = 1;
                let total = 0;

                do {
                    const data = await kriApi.getKRIs({
                        page,
                        size: GROUPED_VIEW_FETCH_PAGE_SIZE,
                        include_archived: listParams.includeArchived,
                        search: listParams.search,
                        monitoring_status: listParams.monitoringStatus,
                        timeliness_status: listParams.timelinessStatus,
                    });

                    if (!isLatestRequest()) {
                        return null;
                    }

                    total = data.total || 0;
                    items.push(...(data.items || []));
                    page += 1;
                } while (items.length < total);

                const filteredItems = isArchivedOnly
                    ? items.filter((kri) => kri.is_archived === true)
                    : items;

                return {
                    items: filteredItems,
                    total: filteredItems.length,
                };
            };

            if (viewMode === 'all' && !isArchivedOnly) {
                const data = await kriApi.getKRIs({
                    page: listParams.page,
                    size: listParams.size,
                    include_archived: listParams.includeArchived,
                    search: listParams.search,
                    monitoring_status: listParams.monitoringStatus,
                    timeliness_status: listParams.timelinessStatus,
                });

                if (!isLatestRequest()) {
                    return;
                }

                setKris(data.items || []);
                setTotalCount(data.total || 0);
            } else {
                const data = await fetchAllMatchingKRIs();
                if (!data || !isLatestRequest()) {
                    return;
                }

                setKris(data.items);
                setTotalCount(data.total);
            }
        } catch (err) {
            if (requestId !== latestRequestIdRef.current) {
                return;
            }
            console.error('Failed to fetch KRIs:', err);
        } finally {
            if (requestId === latestRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [viewMode, currentPage, limit, statusFilter, timelinessFilter, debouncedSearch]);

    const handleRestoreKRI = async (kriId: number, e: MouseEvent) => {
        e.stopPropagation();
        try {
            await kriApi.restoreKRI(kriId);
            await fetchKRIs();
        } catch (err) {
            console.error('Failed to restore KRI:', err);
        }
    };

    const handleExport = async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
        setIsExporting(true);
        try {
            await reportApi.exportKRIs({
                format,
                asOfDate,
                filters: buildKriExportFilters({
                    search,
                    statusFilter,
                    timelinessFilter,
                }),
            });
            setIsExportDialogOpen(false);
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setIsExporting(false);
        }
    };

    useEffect(() => {
        void fetchKRIs();
    }, [fetchKRIs]);

    const updateRouteFilters = useCallback((nextStatusFilter: StatusFilter, nextTimelinessFilter: TimelinessFilter) => {
        setCurrentPage(1);

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('monitoring_status');
        nextParams.delete('timeliness_status');
        nextParams.delete(ARCHIVED_STATUS_PARAM);

        if (nextTimelinessFilter) {
            nextParams.set('timeliness_status', nextTimelinessFilter);
        } else if (nextStatusFilter === 'archived') {
            nextParams.set(ARCHIVED_STATUS_PARAM, ARCHIVED_ROUTE_VALUE);
        } else if (nextStatusFilter !== 'all') {
            nextParams.set('monitoring_status', nextStatusFilter);
        }

        setSearchParams(nextParams, { replace: true });
    }, [searchParams, setSearchParams]);

    const formatNumber = (val: number): string => {
        if (val === 0) return '0';
        if (Math.abs(val) < 1) return val.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (Math.abs(val) < 100) return val.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
        return Math.round(val).toLocaleString('cs-CZ');
    };

    // Table columns matching Risks page style
    const columns: Column<KeyRiskIndicator>[] = [
        {
            key: 'metric_name',
            label: t('columns.metric'),
            sortable: true,
            render: (kri) => (
                <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{kri.metric_name}</span>
                </div>
            ),
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
            render: (kri) => (
                <span className="text-xs text-slate-500">
                    {formatNumber(kri.lower_limit)} – {formatNumber(kri.upper_limit)}
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
                        {kri.is_archived && (
                            <span className="ml-1 px-1 py-0.5 rounded bg-white/10 text-slate-300 border border-white/10">
                                {t('labels.archived')}
                            </span>
                        )}
                    </span>
                );
            },
        },
        {
            key: 'risk_process',
            label: t('columns.risk'),
            sortable: true,
            render: (kri) => (
                <span className="text-white text-xs font-bold block truncate max-w-[150px]" title={kri.risk_process}>
                    {kri.risk_process || t('common:fallbacks.unknown_risk')}
                </span>
            ),
        },
        {
            key: 'risk_description',
            label: t('columns.description'),
            sortable: true,
            render: (kri) => (
                <span className="text-slate-400 text-xs font-medium block truncate max-w-[200px]" title={kri.risk_description}>
                    {kri.risk_description || t('common:fallbacks.not_available')}
                </span>
            ),
        },
        {
            key: 'actions',
            label: '',
            render: (kri) => (
                <div className="flex items-center justify-end gap-2">
                    {kri.is_archived && hasPermission('risks', 'delete') && (
                        <button
                            onClick={(e) => handleRestoreKRI(kri.id, e)}
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

    // Get group by field based on view mode
    const getGroupByField = (): keyof KeyRiskIndicator | null => {
        switch (viewMode) {
            case 'category': return 'risk_category';
            case 'department': return 'department_name';
            case 'process': return 'risk_process';
            case 'risk_type': return 'risk_type';
            case 'risk': return 'risk_name';
            default: return null;
        }
    };

    const totalPages = Math.ceil(totalCount / limit) || 1;
    const paginatedKRIs = viewMode === 'all' && isArchivedOnly
        ? kris.slice((currentPage - 1) * limit, currentPage * limit)
        : kris;

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">{t('title')}</h2>
                    <p className="text-slate-500 font-medium tracking-tight">{t('page_subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsExportDialogOpen(true)}
                        data-testid="kris-export-button"
                        disabled={isExporting}
                        className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-semibold"
                    >
                        <Download className="h-4 w-4" />
                        {t('actions.export')}
                    </button>
                    <button
                        onClick={() => void fetchKRIs()}
                        data-testid="kris-refresh-button"
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-accent hover:bg-accent/10 transition-colors"
                        title={t('common:actions.refresh')}
                    >
                        <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
                    </button>
                    <PermissionGate resource="risks" action="write">
                        <button onClick={() => navigate('/kris/new')} data-testid="kris-create-button" className="btn-primary">
                            <Plus className="h-5 w-5" /> {t('new_kri')}
                        </button>
                    </PermissionGate>
                </div>
            </div>

            {/* View Switcher - Same as Risks */}
            <ViewSwitcher
                value={viewMode}
                onChange={(nextViewMode) => {
                    setViewMode(nextViewMode);
                    setCurrentPage(1);
                }}
                exclude={[
                    'flag',
                    ...(hasPermission('vendors', 'read') ? [] : ['vendor' as const]),
                ]}
            />

            {/* Filters - Same style as Risks */}
            <div className="glass-card flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                    <input
                        data-testid="kris-search-input"
                        type="text"
                        placeholder={t('filters.search_placeholder')}
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                        className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                    />
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                    {/* Button-style status filters */}
                    <button
                        onClick={() => updateRouteFilters('all', 'due_soon')}
                        data-testid="kris-status-filter-due_soon"
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${timelinessFilter === 'due_soon'
                            ? 'bg-accent text-white shadow-lg shadow-accent/20'
                            : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                            }`}
                    >
                        {t('filters.due_soon')}
                    </button>
                    {(['all', ...KRI_MONITORING_FILTER_VALUES, 'archived'] as StatusFilter[]).map((opt) => (
                        <button
                            key={opt}
                            onClick={() => updateRouteFilters(opt, null)}
                            data-testid={`kris-status-filter-${opt}`}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${statusFilter === opt
                                && !timelinessFilter
                                ? 'bg-accent text-white shadow-lg shadow-accent/20'
                                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            {opt === 'all' || opt === 'archived' ? t(`filters.${opt}`) : t(`monitoring.${opt}`)}
                        </button>
                    ))}
                    <button
                        onClick={() => {
                            setSearch('');
                            updateRouteFilters('all', null);
                        }}
                        data-testid="kris-clear-filters-button"
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="glass-card overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/10">
                                {columns.map((col) => (
                                    <th key={String(col.key)} className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[...Array(limit)].map((_, i) => (
                                <tr key={`skeleton-${i}`} className="border-b border-white/5 animate-pulse">
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
            ) : viewMode === 'all' ? (
                <>
                    <SortableTable
                        data={paginatedKRIs}
                        columns={columns}
                        keyExtractor={(kri) => kri.id}
                        onRowClick={(kri) => navigate(`/kris/${kri.id}`)}
                        emptyMessage={timelinessFilter === 'due_soon' ? t('empty_state.no_due_soon_kris') : t('empty_state.no_kris')}
                    />
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalCount}
                        itemsPerPage={limit}
                        onPageChange={setCurrentPage}
                    />
                </>
            ) : viewMode === 'vendor' ? (
                <CategoryDrillDown
                    data={groupedVendorRows}
                    groupBy={'groupValue'}
                    keyExtractor={(row) => row.rowId}
                    getStats={(items: KriGroupedRow[]) => ({
                        total: items.length,
                        activeCount: items.length,
                        highRiskCount: items.filter((row) => row.kri.monitoring_status === 'breach').length,
                    })}
                    renderTable={(items: KriGroupedRow[]) => (
                        <SortableTable
                            data={items.map((row) => row.kri)}
                            columns={columns}
                            keyExtractor={(kri) => kri.id}
                            onRowClick={(kri) => navigate(`/kris/${kri.id}`)}
                            emptyMessage={t('empty_state.no_group')}
                        />
                    )}
                    renderItem={(row: KriGroupedRow) => {
                        const monitoring = getKriMonitoringMeta(row.kri.monitoring_status);
                        const MonitoringIcon = monitoring.icon;
                        return (
                            <div
                                key={row.rowId}
                                onClick={() => navigate(`/kris/${row.kri.id}`)}
                                className="px-6 py-4 hover:bg-white/5 cursor-pointer flex items-center justify-between border-b border-white/5"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-sm font-bold text-white">{row.kri.metric_name}</span>
                                        <span className="text-[10px] text-slate-500">
                                            {row.kri.risk_process || t('common:fallbacks.not_available')}
                                        </span>
                                    </div>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${monitoring.badgeClassName}`}>
                                        <MonitoringIcon className="h-3 w-3" />
                                        {t(monitoring.labelKey)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-6">
                                    <span className={`text-sm font-black ${monitoring.textClassName}`}>
                                        {formatNumber(row.kri.current_value)} <span className="text-slate-500 font-normal text-xs">{row.kri.unit}</span>
                                    </span>
                                    <ChevronRight className="h-4 w-4 text-slate-500" />
                                </div>
                            </div>
                        );
                    }}
                />
            ) : (
                <CategoryDrillDown
                    key={`${viewMode}:${statusFilter}:${timelinessFilter ?? ''}:${debouncedSearch}:${isArchivedOnly ? 'archived' : 'active'}`}
                    data={kris}
                    groupBy={getGroupByField() as keyof KeyRiskIndicator}
                    hideTotal={viewMode === 'risk'}
                    hideHighRisk={viewMode === 'risk'}
                    renderBody={(items) => {
                        if (viewMode !== 'risk' || items.length === 0) return null;
                        const info = items[0];
                        return (
                            <div className="space-y-3 pb-2 border-b border-white/5">
                                <div className="grid grid-cols-2 gap-y-2">
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate" title={`${t('common:labels.type')}: ${info.risk_type || t('common:fallbacks.not_available')}`}>
                                        <Shield className="h-3 w-3 text-accent shrink-0" />
                                        <span className="truncate">{info.risk_type || t('common:fallbacks.unknown_type')}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate" title={`${t('common:labels.department')}: ${info.risk_department_name || t('common:fallbacks.not_available')}`}>
                                        <Building2 className="h-3 w-3 text-accent shrink-0" />
                                        <span className="truncate">{info.risk_department_name || t('common:fallbacks.unassigned')}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate" title={`${t('common:labels.owner')}: ${info.risk_owner_name || t('common:fallbacks.not_available')}`}>
                                        <User className="h-3 w-3 text-accent shrink-0" />
                                        <span className="truncate">{info.risk_owner_name || t('common:fallbacks.no_owner')}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    }}
                    keyExtractor={(kri) => kri.id}
                    getStats={(items: KeyRiskIndicator[]) => ({
                        total: items.length,
                        activeCount: items.length,
                        highRiskCount: items.filter(k => k.monitoring_status === 'breach').length,
                    })}
                    renderTable={(items: KeyRiskIndicator[]) => (
                        <SortableTable
                            data={items}
                            columns={columns}
                            keyExtractor={(kri) => kri.id}
                            onRowClick={(kri) => navigate(`/kris/${kri.id}`)}
                            emptyMessage={t('empty_state.no_group')}
                        />
                    )}
                    renderItem={(kri: KeyRiskIndicator) => (
                        (() => {
                            const monitoring = getKriMonitoringMeta(kri.monitoring_status);
                            const MonitoringIcon = monitoring.icon;
                            return (
                                <div
                                    key={kri.id}
                                    onClick={() => navigate(`/kris/${kri.id}`)}
                                    className="px-6 py-4 hover:bg-white/5 cursor-pointer flex items-center justify-between border-b border-white/5"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-bold text-white">{kri.metric_name}</span>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${monitoring.badgeClassName}`}>
                                            <MonitoringIcon className="h-3 w-3" />
                                            {t(monitoring.labelKey)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <span className={`text-sm font-black ${monitoring.textClassName}`}>
                                            {formatNumber(kri.current_value)} <span className="text-slate-500 font-normal text-xs">{kri.unit}</span>
                                        </span>
                                        <ChevronRight className="h-4 w-4 text-slate-500" />
                                    </div>
                                </div>
                            );
                        })()
                    )}
                />
            )}

            <ExportDialog
                isOpen={isExportDialogOpen}
                onClose={() => setIsExportDialogOpen(false)}
                onSubmit={handleExport}
                isSubmitting={isExporting}
                dataTestId="kris-export-dialog"
            />
        </div>
    );
}
