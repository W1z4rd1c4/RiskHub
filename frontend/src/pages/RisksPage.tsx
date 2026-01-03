import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { approvalsApi } from '@/services/approvalsApi';
import type { RiskSummary, RiskStatus } from '@/types/risk';
import { PermissionGate } from '@/components/PermissionGate';
import { SortableTable, CategoryDrillDown, MiniHeatmap, ViewSwitcher, Pagination } from '@/components/tables';
import type { Column, ViewMode } from '@/components/tables';
import { useRiskTypes, useRiskThresholds } from '@/hooks/useRiskHubConfig';

export function RisksPage() {
    const navigate = useNavigate();
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

    // Risk Hub configuration
    const { riskTypes } = useRiskTypes();
    const { getScoreColor } = useRiskThresholds();

    const [pendingApprovalIds, setPendingApprovalIds] = useState<Set<number>>(new Set());
    const [searchParams, setSearchParams] = useSearchParams();
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

    useEffect(() => {
        const fetchPending = async () => {
            try {
                const response = await approvalsApi.list({ status: 'pending', limit: 1000 });
                const ids = new Set(
                    response.items
                        .filter(a => a.resource_type === 'risk')
                        .map(a => a.resource_id)
                );
                setPendingApprovalIds(ids);
            } catch (error) {
                console.error('Failed to fetch pending approvals:', error);
            }
        };
        fetchPending();
    }, []);

    const fetchRisks = useCallback(async () => {
        try {
            setIsLoading(true);

            // For paginated "all" view, just fetch the current page
            if (viewMode === 'all') {
                const skip = (currentPage - 1) * limit;
                const response = await riskApi.getRisks({
                    skip,
                    limit,
                    search: search || undefined,
                    status: (statusFilter as RiskStatus) || undefined,
                    risk_type: typeFilter || undefined,
                    is_priority: priorityFilter,
                    has_breach: hasBreachFilter,
                    min_net_score: criticalFilter ? 15 : undefined,
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
                const pageSize = 100;
                let allRisks: RiskSummary[] = [];
                let skip = 0;
                let total = 0;

                do {
                    const response = await riskApi.getRisks({
                        skip,
                        limit: pageSize,
                        search: search || undefined,
                        status: (statusFilter as RiskStatus) || undefined,
                        risk_type: typeFilter || undefined,
                        is_priority: priorityFilter,
                        has_breach: hasBreachFilter,
                        min_net_score: criticalFilter ? 15 : undefined,
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
            setError('Failed to load risks. Please check your connection.');
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, search, statusFilter, typeFilter, priorityFilter, viewMode, hasBreachFilter, criticalFilter]);

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

    const getTypeColor = (typeCode: string) => {
        // For system types, use predefined colors
        if (typeCode === 'strategic') return 'text-purple-400 bg-purple-400/10';
        if (typeCode === 'operational') return 'text-blue-400 bg-blue-400/10';
        // For custom types, use a generic accent style
        return 'text-accent bg-accent/10';
    };

    // Column definitions for SortableTable
    const columns: Column<RiskSummary>[] = useMemo(() => [
        {
            key: 'process',
            label: 'Risk',
            sortable: true,
            render: (risk) => (
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{risk.process}</span>
                    {risk.is_priority && (
                        <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                    )}
                    {pendingApprovalIds.has(risk.id) && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-amber-400/10 text-amber-400 border border-amber-400/20" title="Changes Pending Approval">
                            <Lock className="h-2.5 w-2.5" />
                            Pending
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: 'category',
            label: 'Category',
            sortable: true,
            render: (risk) => (
                <span className="text-xs font-medium text-slate-400">{risk.category || '—'}</span>
            ),
        },
        {
            key: 'description',
            label: 'Description',
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
            label: 'Type',
            sortable: true,
            className: 'text-center',
            render: (risk) => (
                <div className="flex justify-center">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getTypeColor(risk.risk_type)}`}>
                        {risk.risk_type === 'strategic' ? 'S' : 'O'}
                    </span>
                </div>
            ),
        },
        {
            key: 'gross_score',
            label: 'Gross',
            sortable: true,
            className: 'text-center',
            render: (risk) => (
                <div className="flex justify-center">
                    <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getScoreColor(risk.gross_score)}`}>
                        {risk.gross_score}
                    </div>
                </div>
            ),
        },
        {
            key: 'net_score',
            label: 'Net',
            sortable: true,
            className: 'text-center',
            render: (risk) => (
                <div className="flex justify-center">
                    <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getScoreColor(risk.net_score)}`}>
                        {risk.net_score}
                    </div>
                </div>
            ),
        },
        {
            key: 'status',
            label: 'Status',
            sortable: true,
            render: (risk) => (
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getStatusColor(risk.status)}`}>
                    {risk.status}
                </span>
            ),
        },
        {
            key: 'control_count',
            label: 'Controls',
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
            key: 'id', // Reusing ID key for KRIs column
            label: 'KRIs',
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
    ], []);

    // Get group by field based on view mode
    const getGroupByField = (): keyof RiskSummary | null => {
        switch (viewMode) {
            case 'category': return 'category';
            case 'department': return 'department_name';
            case 'process': return 'process';
            default: return null;
        }
    };

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">Risk Register</h2>
                    <p className="text-slate-500 font-medium tracking-tight">Track and manage organizational risks with gross/net scoring from OS 18.</p>
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
                            New Risk
                        </button>
                    </PermissionGate>
                </div>
            </div>

            {/* View Switcher */}
            <ViewSwitcher value={viewMode} onChange={setViewMode} />

            {/* Filters */}
            <div className="glass-card flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                    <input
                        type="text"
                        placeholder="Search by process or category..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                    />
                </div>
                <div className="flex gap-3 flex-wrap">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as RiskStatus | '')}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-300 outline-none focus:border-accent/50 appearance-none min-w-[130px]"
                    >
                        <option value="" className="bg-slate-900">All Statuses</option>
                        <option value="active" className="bg-slate-900">Active</option>
                        <option value="monitoring" className="bg-slate-900">Monitoring</option>
                        <option value="closed" className="bg-slate-900">Closed</option>
                    </select>
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-300 outline-none focus:border-accent/50 appearance-none min-w-[130px]"
                    >
                        <option value="" className="bg-slate-900">All Types</option>
                        {riskTypes.map(rt => (
                            <option key={rt.code} value={rt.code} className="bg-slate-900">
                                {rt.display_name}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => setPriorityFilter(priorityFilter === true ? undefined : true)}
                        className={`px-4 py-2.5 rounded-xl border text-sm font-bold transition-all flex items-center gap-2 ${priorityFilter === true
                            ? 'bg-amber-400/20 border-amber-400/50 text-amber-400'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                            }`}
                    >
                        <Star className="h-4 w-4" />
                        Priority
                    </button>
                    {criticalFilter && (
                        <button
                            onClick={() => {
                                setCriticalFilter(false);
                                const newParams = new URLSearchParams(searchParams);
                                newParams.delete('critical');
                                setSearchParams(newParams);
                            }}
                            className="px-4 py-2.5 rounded-xl border text-sm font-bold transition-all flex items-center gap-2 bg-rose-400/20 border-rose-400/50 text-rose-400"
                        >
                            <AlertTriangle className="h-4 w-4" />
                            Critical Only
                            <span className="text-xs opacity-60 ml-1">✕</span>
                        </button>
                    )}
                    {hasBreachFilter && (
                        <button
                            onClick={() => {
                                setHasBreachFilter(undefined);
                                setSearchParams({});
                            }}
                            className="px-4 py-2.5 rounded-xl border text-sm font-bold transition-all flex items-center gap-2 bg-rose-400/20 border-rose-400/50 text-rose-400"
                        >
                            <AlertCircle className="h-4 w-4" />
                            Breached Only
                            <span className="text-xs opacity-60 ml-1">✕</span>
                        </button>
                    )}
                    <button
                        onClick={() => fetchRisks()}
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
                        <p className="text-white font-bold text-xl">Error Loading Risks</p>
                        <p className="text-slate-500 max-w-sm mx-auto">{error}</p>
                    </div>
                    <button onClick={fetchRisks} className="text-accent font-bold hover:underline">Try Again</button>
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
                        emptyMessage="No risks found matching your criteria."
                    />
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalCount}
                        itemsPerPage={limit}
                        onPageChange={setCurrentPage}
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
                            emptyMessage="No risks in this category."
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
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-white">{risk.process}</span>
                                    {risk.is_priority && <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />}
                                </div>
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getStatusColor(risk.status)}`}>
                                    {risk.status}
                                </span>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getScoreColor(risk.gross_score)}`}>
                                    G: {risk.gross_score}
                                </div>
                                <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getScoreColor(risk.net_score)}`}>
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
