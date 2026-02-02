import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { Plus, Search, RefreshCw, AlertTriangle, CheckCircle, ChevronRight, User, Shield, Building2 } from 'lucide-react';
import { kriApi } from '@/services/kriApi';
import { PermissionGate } from '@/components/PermissionGate';
import { ViewSwitcher, SortableTable, Pagination, CategoryDrillDown } from '@/components/tables';
import type { Column, ViewMode } from '@/components/tables';
import type { KeyRiskIndicator } from '@/types/kri';

type StatusFilter = 'all' | 'within' | 'breach' | 'overdue';

export function KRIsPage() {
    const navigate = useNavigate();
    const [kris, setKris] = useState<KeyRiskIndicator[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const { t } = useTranslation('kris');
    const limit = 10;

    const fetchKRIs = useCallback(async () => {
        setIsLoading(true);
        try {
            // For 'all' view, use server-side pagination
            if (viewMode === 'all') {
                const data = await kriApi.getKRIs({ page: currentPage, size: limit });
                setKris(data.items || []);
                setTotalCount(data.total || 0);
            } else {
                // For grouped views, fetch ALL pages for accurate group counts
                const pageSize = 100;
                let allKRIs: KeyRiskIndicator[] = [];
                let page = 1;
                let total = 0;

                do {
                    const data = await kriApi.getKRIs({ page, size: pageSize });
                    total = data.total || 0;
                    allKRIs = [...allKRIs, ...(data.items || [])];
                    page++;
                } while ((page - 1) * pageSize < total);

                setKris(allKRIs);
                setTotalCount(total);
            }
        } catch (err) {
            console.error('Failed to fetch KRIs:', err);
        } finally {
            setIsLoading(false);
        }
    }, [viewMode, currentPage]);

    useEffect(() => {
        fetchKRIs();
    }, [fetchKRIs]);

    const formatNumber = (val: number): string => {
        if (val === 0) return '0';
        if (Math.abs(val) < 1) return val.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (Math.abs(val) < 100) return val.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
        return Math.round(val).toLocaleString('cs-CZ');
    };

    // Filter KRIs
    const filteredKRIs = kris.filter(kri => {
        const matchesSearch = !search || kri.metric_name.toLowerCase().includes(search.toLowerCase());

        // Calculate overdue status (last_period_end + 15 days < now)
        const isOverdue = kri.last_period_end
            ? new Date(kri.last_period_end).getTime() + (15 * 24 * 60 * 60 * 1000) < Date.now()
            : false;

        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'within' && kri.breach_status === 'within') ||
            (statusFilter === 'breach' && kri.breach_status !== 'within') ||
            (statusFilter === 'overdue' && isOverdue);
        return matchesSearch && matchesStatus;
    });

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
                const isBreaching = kri.breach_status !== 'within';
                return (
                    <span className={`font-black ${isBreaching ? 'text-rose-400' : 'text-white'}`}>
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
            key: 'breach_status',
            label: t('columns.status'),
            sortable: true,
            render: (kri) => {
                const isBreaching = kri.breach_status !== 'within';
                return (
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase w-fit ${isBreaching
                        ? 'bg-rose-500/10 text-rose-400'
                        : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                        {isBreaching ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                        {isBreaching ? t('filters.breach') : t('columns.ok')}
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
                    {kri.risk_process || `Risk #${kri.risk_id}`}
                </span>
            ),
        },
        {
            key: 'risk_description',
            label: t('columns.description'),
            sortable: true,
            render: (kri) => (
                <span className="text-slate-400 text-xs font-medium block truncate max-w-[200px]" title={kri.risk_description}>
                    {kri.risk_description || '—'}
                </span>
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

    // Pagination - use server total for 'all' view, filtered length for grouped views
    const totalPages = viewMode === 'all'
        ? Math.ceil(totalCount / limit) || 1
        : Math.ceil(filteredKRIs.length / limit) || 1;
    // For 'all' view, data is already paginated from server; for grouped, use client-side slice
    const paginatedKRIs = viewMode === 'all'
        ? filteredKRIs
        : filteredKRIs.slice((currentPage - 1) * limit, currentPage * limit);

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">{t('title')}</h2>
                    <p className="text-slate-500 font-medium tracking-tight">{t('page_subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchKRIs}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-accent hover:bg-accent/10 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
                    </button>
                    <PermissionGate resource="risks" action="write">
                        <button onClick={() => navigate('/kris/new')} className="btn-primary">
                            <Plus className="h-5 w-5" /> {t('new_kri')}
                        </button>
                    </PermissionGate>
                </div>
            </div>

            {/* View Switcher - Same as Risks */}
            <ViewSwitcher value={viewMode} onChange={setViewMode} />

            {/* Filters - Same style as Risks */}
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
                <div className="flex gap-2 flex-wrap items-center">
                    {/* Button-style status filters */}
                    {(['all', 'within', 'breach', 'overdue'] as StatusFilter[]).map((opt) => (
                        <button
                            key={opt}
                            onClick={() => { setStatusFilter(opt); setCurrentPage(1); }}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${statusFilter === opt
                                ? 'bg-accent text-white shadow-lg shadow-accent/20'
                                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            {t(`filters.${opt}`)}
                        </button>
                    ))}
                    <button
                        onClick={() => { setSearch(''); setStatusFilter('all'); setCurrentPage(1); }}
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
                        emptyMessage={t('empty_state.no_kris')}
                    />
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={filteredKRIs.length}
                        itemsPerPage={limit}
                        onPageChange={setCurrentPage}
                    />
                </>
            ) : (
                <CategoryDrillDown
                    data={filteredKRIs}
                    groupBy={getGroupByField() as keyof KeyRiskIndicator}
                    hideTotal={viewMode === 'risk'}
                    hideHighRisk={viewMode === 'risk'}
                    renderBody={(items) => {
                        if (viewMode !== 'risk' || items.length === 0) return null;
                        const info = items[0];
                        return (
                            <div className="space-y-3 pb-2 border-b border-white/5">
                                <div className="grid grid-cols-2 gap-y-2">
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate" title={`Type: ${info.risk_type || 'N/A'}`}>
                                        <Shield className="h-3 w-3 text-accent shrink-0" />
                                        <span className="truncate">{info.risk_type || 'Unknown Type'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate" title={`Dept: ${info.risk_department_name || 'N/A'}`}>
                                        <Building2 className="h-3 w-3 text-accent shrink-0" />
                                        <span className="truncate">{info.risk_department_name || 'Unassigned'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate" title={`Owner: ${info.risk_owner_name || 'N/A'}`}>
                                        <User className="h-3 w-3 text-accent shrink-0" />
                                        <span className="truncate">{info.risk_owner_name || 'No Owner'}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    }}
                    keyExtractor={(kri) => kri.id}
                    getStats={(items: KeyRiskIndicator[]) => ({
                        total: items.length,
                        activeCount: items.length,
                        highRiskCount: items.filter(k => k.breach_status !== 'within').length,
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
                        <div
                            key={kri.id}
                            onClick={() => navigate(`/kris/${kri.id}`)}
                            className="px-6 py-4 hover:bg-white/5 cursor-pointer flex items-center justify-between border-b border-white/5"
                        >
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-bold text-white">{kri.metric_name}</span>
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${kri.breach_status === 'within'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-rose-500/10 text-rose-400'
                                    }`}>
                                    {kri.breach_status === 'within' ? 'OK' : 'Breach'}
                                </span>
                            </div>
                            <div className="flex items-center gap-6">
                                <span className="text-sm font-black text-white">
                                    {formatNumber(kri.current_value)} <span className="text-slate-500 font-normal text-xs">{kri.unit}</span>
                                </span>
                                <ChevronRight className="h-4 w-4 text-slate-500" />
                            </div>
                        </div>
                    )}
                />
            )}
        </div>
    );
}
