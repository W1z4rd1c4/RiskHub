import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Plus,
    Search,
    ChevronRight,
    RefreshCw,
    AlertCircle,
    AlertTriangle,
    Star,
    FileText,
    Sheet,
    Lock
} from 'lucide-react';
import { reportApi } from '@/services/reportApi';
import { riskApi } from '@/services/riskApi';
import type { RiskSummary, RiskStatus } from '@/types/risk';
import { PermissionGate } from '@/components/PermissionGate';
import { SortableTable } from '@/components/tables/SortableTable';
import { CategoryDrillDown, MiniHeatmap, ViewSwitcher, Pagination } from '@/components/tables';
import type { ViewMode } from '@/components/tables';
import type { Column, SortDirection } from '@/components/tables/SortableTable';
import { useRiskTypes, useRiskThresholds } from '@/hooks/useRiskHubConfig';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePendingApprovalIds } from '@/hooks/usePendingApprovalIds';

// Helper to convert hex color to rgba for backgrounds/borders
function hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(100, 116, 139, ${alpha})`; // slate-500 fallback
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function RisksPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // State
    const [risks, setRisks] = useState<RiskSummary[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<RiskStatus | ''>('');
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [priorityFilter, setPriorityFilter] = useState<boolean | undefined>(undefined);
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [isExporting, setIsExporting] = useState(false);
    const [hasBreachFilter, setHasBreachFilter] = useState<boolean | undefined>(undefined);
    const [criticalFilter, setCriticalFilter] = useState<boolean>(false);
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);

    // Shared hooks for debouncing and pending approvals
    const debouncedSearch = useDebouncedValue(search, 300);
    const pendingApprovalIds = usePendingApprovalIds('risk');

    // Risk Hub configuration
    const { riskTypes, getColor, getInitials, getDisplayName } = useRiskTypes();
    const { getScoreColor } = useRiskThresholds();
    const { t } = useTranslation('risks');
    const limit = 10;

    useEffect(() => {
        if (searchParams.get('breached') === 'true') {
            setHasBreachFilter(true);
        } else {
            setHasBreachFilter(undefined);
        }
        // Check for critical filter
        if (searchParams.get('critical') === 'true') {
            setCriticalFilter(true);
        } else {
            setCriticalFilter(false);
        }
    }, [searchParams]);



    const fetchRisks = useCallback(async () => {
        try {
            // Only show skeleton for initial load OR non-search changes.
            // For search updates, we fetch in the background to avoid flashing.
            const shouldShowSkeleton = risks.length === 0;

            if (shouldShowSkeleton) {
                setIsLoading(true);
            }

            // For paginated "all" view, just fetch the current page
            if (viewMode === 'all') {
                const skip = (currentPage - 1) * limit;
                const response = await riskApi.getRisks({
                    skip,
                    limit,
                    search: debouncedSearch || undefined,
                    status: (statusFilter as RiskStatus) || undefined,
                    risk_type: typeFilter || undefined,
                    is_priority: priorityFilter,
                    has_breach: hasBreachFilter,
                    min_net_score: criticalFilter ? 15 : undefined,
                    sort_by: sortField || undefined, // Added sort_by
                    sort_order: sortDirection || undefined, // Added sort_order
                });

                const risksWithCounts = response.items.map(risk => ({
                    ...risk,
                    kri_count: risk.kri_count ?? 0,
                    has_breach: risk.has_breach ?? false,
                    control_count: risk.control_count ?? 0
                }));

                setRisks(risksWithCounts);
                setTotalCount(response.total);
            } else {
                // For grouped views, fetch ALL pages for accurate group counts
                const pageSize = 100; // Backend max limit is 100
                let allRisks: RiskSummary[] = [];
                let skip = 0;
                let total = 0;

                do {
                    const response = await riskApi.getRisks({
                        skip,
                        limit: pageSize,
                        search: debouncedSearch || undefined,
                        status: (statusFilter as RiskStatus) || undefined,
                        risk_type: typeFilter || undefined,
                        is_priority: priorityFilter,
                        has_breach: hasBreachFilter,
                        min_net_score: criticalFilter ? 15 : undefined,
                        sort_by: sortField || undefined,
                        sort_order: sortDirection || undefined,
                    });

                    total = response.total;
                    const risksWithCounts = response.items.map(risk => ({
                        ...risk,
                        kri_count: risk.kri_count ?? 0,
                        has_breach: risk.has_breach ?? false,
                        control_count: risk.control_count ?? 0
                    }));
                    allRisks = [...allRisks, ...risksWithCounts];
                    skip += pageSize;
                } while (skip < total);

                setRisks(allRisks);
                setTotalCount(total);
            }

            setError(null);
        } catch (err) {
            console.error('[RisksPage] Error fetching risks:', err);
            setError(t('errors.load_failed'));
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, debouncedSearch, statusFilter, typeFilter, priorityFilter, viewMode, hasBreachFilter, criticalFilter, sortField, sortDirection]);

    useEffect(() => {
        fetchRisks();
    }, [fetchRisks]);

    const handleExportPdf = async () => {
        setIsExporting(true);
        try {
            await reportApi.downloadRisksPdf({ status: statusFilter || null });
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            await reportApi.downloadRisksExcel({ status: statusFilter || null });
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setIsExporting(false);
        }
    };

    const getStatusColor = (status: RiskStatus) => {
        switch (status) {
            case 'active': return 'text-emerald-400 bg-emerald-400/10';
            case 'monitoring': return 'text-amber-400 bg-amber-400/10';
            case 'closed': return 'text-slate-400 bg-slate-400/10';
            case 'archived': return 'text-rose-400 bg-rose-400/10';
            default: return 'text-slate-400 bg-slate-400/10';
        }
    };

    // getTypeColor removed - now using config-driven colors from useRiskTypes

    // Column definitions for SortableTable
    const columns: Column<RiskSummary>[] = useMemo(() => [
        {
            key: 'name',
            label: t('columns.name'),
            className: 'w-[450px] min-w-[300px]',
            sortable: true,
            render: (risk) => (
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{risk.name}</span>
                        {risk.is_priority && (
                            <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                        )}
                        {pendingApprovalIds.has(risk.id) && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-amber-400/10 text-amber-400 border border-amber-400/20" title="Changes Pending Approval">
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
            render: (risk) => (
                <span className="text-xs font-medium text-slate-400">{risk.category || '—'}</span>
            ),
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
                        <span
                            className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
                            style={{
                                color: typeColor,
                                backgroundColor: hexToRgba(typeColor, 0.12),
                                borderColor: hexToRgba(typeColor, 0.24),
                            }}
                            title={getDisplayName(risk.risk_type)}
                        >
                            {getInitials(risk.risk_type)}
                        </span>
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
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getStatusColor(risk.status)}`}>
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
                // For now we assume the count is provided or we can fetch it. 
                // Since RiskSummary was updated, we'll try to use risk.kri_count
                const count = risk.kri_count || 0;
                const hasBreach = risk.has_breach || false;

                if (count === 0) return <span className="text-slate-600 text-[10px]">—</span>;

                return (
                    <div className="flex justify-center">
                        <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 ${hasBreach
                            ? 'text-rose-400 bg-rose-400/10'
                            : 'text-emerald-400 bg-emerald-400/10'
                            }`}>
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
            render: () => (
                <div className="text-right">
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                </div>
            ),
        },
    ], [pendingApprovalIds, getColor, getDisplayName, getInitials, getScoreColor]); // Added dependencies for useMemo

    // Get group by field based on view mode
    const getGroupByField = (): keyof RiskSummary | null => {
        switch (viewMode) {
            case 'category': return 'category';
            case 'department': return 'department_name';
            case 'process': return 'process';
            case 'risk_type': return 'risk_type';
            default: return null;
        }
    };

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">{t('title')}</h2>
                    <p className="text-slate-500 font-medium tracking-tight">{t('page_subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportPdf}
                        disabled={isExporting}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                        title="Export PDF"
                    >
                        <FileText className="h-5 w-5" />
                    </button>
                    <button
                        onClick={handleExportExcel}
                        disabled={isExporting}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors disabled:opacity-50"
                        title="Export Excel"
                    >
                        <Sheet className="h-5 w-5" />
                    </button>
                    <PermissionGate resource="risks" action="write">
                        <button
                            onClick={() => navigate('/risks/new')}
                            className="btn-primary"
                        >
                            <Plus className="h-5 w-5" />
                            {t('new_risk')}
                        </button>
                    </PermissionGate>
                </div>
            </div>

            {/* View Switcher */}
            <ViewSwitcher value={viewMode} onChange={(v) => { setViewMode(v); setRisks([]); setCurrentPage(1); }} exclude={['risk']} />

            {/* Filters Bar */}
            <div className="glass-card flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                    <input
                        type="text"
                        placeholder={t('filters.search_placeholder')}
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                        className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                    />
                </div>
                <div className="flex gap-4 items-center">
                    <ThemedSelect
                        value={statusFilter}
                        onValueChange={(v) => { setStatusFilter(v as RiskStatus | ''); setRisks([]); setCurrentPage(1); }}
                        placeholder={t('filters.all_statuses')}
                        allowEmpty
                        emptyLabel={t('filters.all_statuses')}
                        options={[
                            { value: 'active', label: t('status.active') },
                            { value: 'monitoring', label: t('status.mitigated') },
                            { value: 'closed', label: t('status.closed') },
                        ]}
                    />
                    <ThemedSelect
                        value={typeFilter}
                        onValueChange={(v) => { setTypeFilter(v); setRisks([]); setCurrentPage(1); }}
                        placeholder={t('filters.all_types')}
                        allowEmpty
                        emptyLabel={t('filters.all_types')}
                        options={riskTypes.map(rt => ({ value: rt.code, label: rt.display_name }))}
                    />
                    <button
                        onClick={() => { setPriorityFilter(priorityFilter === true ? undefined : true); setRisks([]); setCurrentPage(1); }}
                        className={`p-2.5 rounded-xl border transition-all ${priorityFilter === true
                            ? 'bg-amber-400/20 border-amber-400/50 text-amber-400'
                            : 'glass text-slate-400 hover:text-white'
                            }`}
                        title="Priority Risks"
                    >
                        <Star className="h-5 w-5" />
                    </button>
                    {criticalFilter && (
                        <button
                            onClick={() => {
                                setCriticalFilter(false);
                                const newParams = new URLSearchParams(searchParams);
                                newParams.delete('critical');
                                setSearchParams(newParams);
                            }}
                            className="p-2.5 rounded-xl border bg-rose-400/20 border-rose-400/50 text-rose-400"
                            title="Critical Only (click to clear)"
                        >
                            <AlertTriangle className="h-5 w-5" />
                        </button>
                    )}
                    {hasBreachFilter && (
                        <button
                            onClick={() => {
                                setHasBreachFilter(undefined);
                                setSearchParams({});
                            }}
                            className="p-2.5 rounded-xl border bg-rose-400/20 border-rose-400/50 text-rose-400"
                            title="Breached Only (click to clear)"
                        >
                            <AlertCircle className="h-5 w-5" />
                        </button>
                    )}
                    <button
                        onClick={() => { fetchRisks(); setRisks([]); }}
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
                    <button onClick={fetchRisks} className="text-accent font-bold hover:underline">{t('errors.try_again')}</button>
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
                                <tr key={`skeleton - ${i} `} className="border-b border-white/5 animate-pulse">
                                    <td className="px-6 py-4"><div className="h-4 w-24 bg-white/5 rounded" /></td>
                                    <td className="px-6 py-4"><div className="h-5 w-20 bg-white/5 rounded-md" /></td>
                                    <td className="px-6 py-4"><div className="h-6 w-10 bg-white/5 rounded-full mx-auto" /></td>
                                    <td className="px-6 py-4"><div className="h-6 w-10 bg-white/5 rounded-full mx-auto" /></td>
                                    <td className="px-6 py-4"><div className="h-6 w-10 bg-white/5 rounded-full mx-auto" /></td>
                                    <td className="px-6 py-4"><div className="h-5 w-16 bg-white/5 rounded-md" /></td>
                                    <td className="px-6 py-4"><div className="h-4 w-4 bg-white/5 rounded ml-auto" /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : viewMode === 'all' ? (
                <>
                    <SortableTable
                        data={risks}
                        columns={columns}
                        keyExtractor={(risk) => risk.id}
                        onRowClick={(risk) => navigate(`/risks/${risk.id}`)}
                        emptyMessage={t('empty_state.no_risks')}
                        sortKey={sortField}
                        sortDirection={sortDirection}
                        onSort={(key, direction) => {
                            setSortField(key);
                            setSortDirection(direction);
                        }}
                    />
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalCount}
                        itemsPerPage={limit}
                        onPageChange={(p) => { setCurrentPage(p); setRisks([]); }}
                    />
                </>
            ) : (
                <CategoryDrillDown
                    data={risks}
                    groupBy={getGroupByField() as keyof RiskSummary}
                    keyExtractor={(risk) => risk.id}
                    getStats={(items) => ({
                        total: items.length,
                        activeCount: items.filter(r => r.status === 'active').length,
                        highRiskCount: items.filter(r => r.net_score >= 16).length,
                    })}
                    renderTable={(items) => (
                        <SortableTable
                            data={items}
                            columns={columns}
                            keyExtractor={(risk) => risk.id}
                            onRowClick={(risk) => navigate(`/risks/${risk.id}`)}
                            emptyMessage={t('empty_state.no_risks')}
                        />
                    )}
                    renderGroupExtra={(items) => (
                        <MiniHeatmap risks={items} />
                    )}
                    renderItem={(risk) => (
                        <div
                            onClick={() => navigate(`/risks/${risk.id}`)}
                            className="px-6 py-4 hover:bg-white/5 cursor-pointer flex items-center justify-between"
                        >
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-white">{risk.name}</span>
                                        {risk.is_priority && <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />}
                                    </div>
                                    <span className="text-[10px] text-slate-500">{risk.process}</span>
                                </div>
                                <span className={`px - 2 py - 0.5 rounded - md text - [10px] font - bold uppercase ${getStatusColor(risk.status)} `}>
                                    {risk.status}
                                </span>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className={`px - 2.5 py - 1 rounded - full text - [10px] font - black border ${getScoreColor(risk.gross_score)} `}>
                                    G: {risk.gross_score}
                                </div>
                                <div className={`px - 2.5 py - 1 rounded - full text - [10px] font - black border ${getScoreColor(risk.net_score)} `}>
                                    N: {risk.net_score}
                                </div>
                                <ChevronRight className="h-4 w-4 text-slate-500" />
                            </div>
                        </div>
                    )}
                />
            )}
        </div>
    );
}
