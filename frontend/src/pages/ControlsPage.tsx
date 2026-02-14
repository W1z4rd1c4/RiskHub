import { useState, useEffect, useCallback, useMemo, useRef, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import {
    Plus,
    Search,
    Calendar,
    ChevronRight,
    RefreshCw,
    AlertCircle,
    Download,
    Lock,
    User,
    Shield,
    Building2
} from 'lucide-react';
import { controlApi } from '@/services/controlApi';
import { reportApi } from '@/services/reportApi';
import type { ControlSummary } from '@/types/control';
import { ControlStatus } from '@/types/control';
import { PermissionGate } from '@/components/PermissionGate';
import { SortableTable, CategoryDrillDown, ViewSwitcher, Pagination } from '@/components/tables';
import type { Column, ViewMode } from '@/components/tables';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { DEFAULT_LIST_PAGE_SIZE, GROUPED_VIEW_FETCH_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePendingApprovalIds } from '@/hooks/usePendingApprovalIds';
import { useAuth } from '@/contexts/AuthContext';
import { ExportDialog, type ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';


/**
 * Fetches all controls across all pages for grouped views.
 * Preserves pageSize=100 logic, concatenation order, and error semantics.
 */
async function fetchAllForGroupedView(
    search: string,
    status: string,
): Promise<{ items: ControlSummary[]; total: number }> {
    const pageSize = GROUPED_VIEW_FETCH_PAGE_SIZE;
    let allControls: ControlSummary[] = [];
    let skip = 0;
    let total = 0;

    do {
        const response = await controlApi.getControls({
            skip,
            limit: pageSize,
            search: search || undefined,
            status: status || undefined,
            include_archived: status === ControlStatus.ARCHIVED,
        });

        total = response.total;
        allControls = [...allControls, ...response.items];
        skip += pageSize;
    } while (skip < total);

    return { items: allControls, total };
}

export function ControlsPage() {
    const navigate = useNavigate();

    // State
    const [controls, setControls] = useState<ControlSummary[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [isExporting, setIsExporting] = useState(false);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const hasLoadedControlsRef = useRef(false);

    const limit = DEFAULT_LIST_PAGE_SIZE;
    const { t } = useTranslation('controls');
    const { hasPermission } = useAuth();

    // Use shared hooks for debouncing and pending approvals
    const debouncedSearch = useDebouncedValue(search, 300);
    const pendingApprovalIds = usePendingApprovalIds('control');


    const fetchControls = useCallback(async () => {
        try {
            // Only show skeleton for initial load
            const shouldShowSkeleton = !hasLoadedControlsRef.current;
            if (shouldShowSkeleton) {
                setIsLoading(true);
            }

            const shouldIncludeArchived = statusFilter === ControlStatus.ARCHIVED;
            if (viewMode === 'all') {
                // Paginated "all" view: fetch current page only
                const skip = (currentPage - 1) * limit;
                const response = await controlApi.getControls({
                    skip,
                    limit,
                    search: debouncedSearch || undefined,
                    status: statusFilter || undefined,
                    include_archived: shouldIncludeArchived,
                });
                setControls(response.items);
                setTotalCount(response.total);
            } else {
                // Grouped views: fetch all pages for accurate group counts
                const { items, total } = await fetchAllForGroupedView(
                    debouncedSearch,
                    statusFilter,
                );
                setControls(items);
                setTotalCount(total);
            }

            setError(null);
            hasLoadedControlsRef.current = true;
        } catch (err) {
            console.error('Error fetching controls:', err);
            setError(t('errors.load_failed'));
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, debouncedSearch, limit, statusFilter, t, viewMode]);

    const handleRestoreControl = useCallback(async (controlId: number, e: MouseEvent) => {
        e.stopPropagation();
        try {
            await controlApi.restoreControl(controlId);
            await fetchControls();
        } catch (err) {
            console.error('Restore failed:', err);
            setError(t('errors.load_failed'));
        }
    }, [fetchControls, t]);

    useEffect(() => {
        fetchControls();
    }, [fetchControls]);

    const handleExport = async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
        setIsExporting(true);
        try {
            await reportApi.exportControls({
                format,
                asOfDate,
                filters: {
                    status: statusFilter || null,
                    search: search.trim() || null,
                },
            });
            setIsExportDialogOpen(false);
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setIsExporting(false);
        }
    };

    const getRiskLevelColor = (level: number) => {
        if (level >= 5) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
        if (level >= 4) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
        if (level >= 3) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
        if (level >= 2) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
        return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    };

    const getStatusColor = (status: ControlStatus) => {
        switch (status) {
            case ControlStatus.ACTIVE: return 'text-emerald-400 bg-emerald-400/10';
            case ControlStatus.DRAFT: return 'text-slate-400 bg-slate-400/10';
            case ControlStatus.INACTIVE: return 'text-rose-400 bg-rose-400/10';
            case ControlStatus.ARCHIVED: return 'text-yellow-400 bg-yellow-400/10';
            default: return 'text-slate-400 bg-slate-400/10';
        }
    };

    // Column definitions for SortableTable
    const columns: Column<ControlSummary>[] = useMemo(() => [
        {
            key: 'name',
            label: t('columns.name'),
            sortable: true,
            render: (control) => (
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{control.name}</span>
                    {pendingApprovalIds.has(control.id) && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-amber-400/10 text-amber-400 border border-amber-400/20" title={t('columns.pending_changes_title')}>
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
                <span className="text-xs font-medium text-slate-300">{control.department_name || t('common:fallbacks.unassigned')}</span>
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
                    <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getRiskLevelColor(control.risk_level)}`}>
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
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getStatusColor(control.status)}`}>
                    {control.status}
                </span>
            ),
        },
        {
            key: 'actions',
            label: '',
            render: (control) => (
                <div className="text-right flex items-center justify-end gap-2">
                    {control.status === ControlStatus.ARCHIVED && hasPermission('controls', 'delete') && (
                        <button
                            onClick={(e) => handleRestoreControl(control.id, e)}
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
    ], [handleRestoreControl, hasPermission, pendingApprovalIds, t]);

    // Get group by field based on view mode
    const getGroupByField = (): keyof ControlSummary | null => {
        switch (viewMode) {
            case 'category': return 'control_form';
            case 'department': return 'department_name';
            case 'process': return 'frequency';
            case 'risk_type': return 'risk_type';
            case 'risk': return 'risk_name';
            default: return null;
        }
    };

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">{t('title')}</h2>
                    <p className="text-slate-500 font-medium tracking-tight">{t('page_subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsExportDialogOpen(true)}
                        data-testid="controls-export-button"
                        disabled={isExporting}
                        className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-semibold"
                    >
                        <Download className="h-4 w-4" />
                        {t('actions.export')}
                    </button>
                    <PermissionGate resource="controls" action="write">
                        <button
                            onClick={() => navigate('/controls/new')}
                            data-testid="controls-create-button"
                            className="btn-primary"
                        >
                            <Plus className="h-5 w-5" />
                            {t('new_control')}
                        </button>
                    </PermissionGate>
                </div>
            </div>

            {/* View Switcher */}
            <ViewSwitcher value={viewMode} onChange={(v) => { setViewMode(v); setControls([]); setCurrentPage(1); }} />

            {/* Filters Bar */}
            <div className="glass-card flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                    <input
                        data-testid="controls-search-input"
                        type="text"
                        placeholder={t('filters.search_placeholder')}
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                        className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                    />
                </div>
                <div className="flex gap-4">
                    <ThemedSelect
                        value={statusFilter}
                        onValueChange={(v) => {
                            setStatusFilter(v);
                            setControls([]);
                            setCurrentPage(1);
                        }}
                        placeholder={t('filters.all_statuses')}
                        allowEmpty
                        emptyLabel={t('filters.all_statuses')}
                        triggerTestId="controls-status-filter-trigger"
                        contentTestId="controls-status-filter-content"
                        optionTestIdPrefix="controls-status-filter-option"
                        options={[
                            { value: 'active', label: t('status.active') },
                            { value: 'draft', label: t('status.draft') },
                            { value: 'inactive', label: t('status.inactive') },
                            { value: 'archived', label: t('status.archived') },
                        ]}
                    />
                    <button
                        onClick={() => { fetchControls(); setControls([]); }}
                        data-testid="controls-refresh-button"
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors"
                    >
                        <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
                    </button>

                </div>
            </div>

            {/* Content */}
            {error ? (
                <div className="glass-card p-20 flex flex-col items-center justify-center text-center gap-4">
                    <AlertCircle className="h-12 w-12 text-rose-500" />
                    <div>
                        <p className="text-white font-bold text-xl">{t('errors.title')}</p>
                        <p className="text-slate-500 max-w-sm mx-auto">{error}</p>
                    </div>
                    <button onClick={fetchControls} className="text-accent font-bold hover:underline">{t('errors.try_again')}</button>
                </div>
            ) : isLoading ? (
                <div className="glass-card !p-0 overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
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
                                    <td className="px-6 py-4"><div className="h-4 w-40 bg-white/5 rounded" /></td>
                                    <td className="px-6 py-4"><div className="h-4 w-24 bg-white/5 rounded" /></td>
                                    <td className="px-6 py-4"><div className="h-4 w-20 bg-white/5 rounded" /></td>
                                    <td className="px-6 py-4"><div className="h-6 w-12 bg-white/5 rounded-full mx-auto" /></td>
                                    <td className="px-6 py-4"><div className="h-6 w-16 bg-white/5 rounded-full" /></td>
                                    <td className="px-6 py-4"><div className="h-4 w-4 bg-white/5 rounded ml-auto" /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : viewMode === 'all' ? (
                <>
                    <SortableTable
                        data={controls}
                        columns={columns}
                        keyExtractor={(control) => control.id}
                        onRowClick={(control) => navigate(`/controls/${control.id}`)}
                        emptyMessage={t('empty_state.no_controls')}
                    />
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalCount}
                        itemsPerPage={limit}
                        onPageChange={(p) => { setCurrentPage(p); setControls([]); }}
                    />
                </>
            ) : (
                <CategoryDrillDown
                    data={controls}
                    groupBy={getGroupByField() as keyof ControlSummary}
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
                    keyExtractor={(control) => control.id}
                    getStats={(items) => ({
                        total: items.length,
                        activeCount: items.filter(c => c.status === ControlStatus.ACTIVE).length,
                        highRiskCount: items.filter(c => c.risk_level >= 4).length,
                    })}
                    renderTable={(items) => (
                        <SortableTable
                            data={items}
                            columns={columns}
                            keyExtractor={(control) => control.id}
                            onRowClick={(control) => navigate(`/controls/${control.id}`)}
                            emptyMessage={t('empty_state.no_controls')}
                        />
                    )}
                    renderItem={(control) => (
                        <div
                            onClick={() => navigate(`/controls/${control.id}`)}
                            className="px-6 py-4 hover:bg-white/5 cursor-pointer flex items-center justify-between"
                        >
                            <div className="flex-1 min-w-0 mr-4">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm font-bold text-white">{control.name}</span>
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getStatusColor(control.status)}`}>
                                        {control.status}
                                    </span>
                                </div>
                                {control.description && (
                                    <p className="text-xs text-slate-500 mt-1 truncate max-w-lg">{control.description}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                                <div className="flex items-center gap-2 text-xs text-slate-400 capitalize">
                                    <Calendar className="h-3 w-3 text-accent" />
                                    {control.frequency}
                                </div>
                                <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getRiskLevelColor(control.risk_level)}`}>
                                    {control.risk_level}/5
                                </div>
                                <ChevronRight className="h-4 w-4 text-slate-500" />
                            </div>
                        </div>
                    )}
                />
            )}

            <ExportDialog
                isOpen={isExportDialogOpen}
                onClose={() => setIsExportDialogOpen(false)}
                onSubmit={handleExport}
                isSubmitting={isExporting}
                dataTestId="controls-export-dialog"
            />
        </div>
    );
}
