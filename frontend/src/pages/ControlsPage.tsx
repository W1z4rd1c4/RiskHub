import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Search,
    Calendar,
    ChevronRight,
    RefreshCw,
    AlertCircle,
    FileText,

    Sheet,
    Lock
} from 'lucide-react';
import { controlApi } from '@/services/controlApi';
import { reportApi } from '@/services/reportApi';
import { approvalsApi } from '@/services/approvalsApi';
import type { ControlSummary } from '@/types/control';
import { ControlStatus } from '@/types/control';
import { PermissionGate } from '@/components/PermissionGate';
import { SortableTable, CategoryDrillDown, ViewSwitcher, Pagination } from '@/components/tables';
import type { Column, ViewMode } from '@/components/tables';


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

    const [pendingApprovalIds, setPendingApprovalIds] = useState<Set<number>>(new Set());
    const limit = 10;

    const fetchControls = useCallback(async () => {
        try {
            setIsLoading(true);
            const fetchLimit = viewMode === 'all' ? limit : 100;
            const skip = viewMode === 'all' ? (currentPage - 1) * limit : 0;

            const response = await controlApi.getControls({
                skip,
                limit: fetchLimit,
                search: search || undefined,
                status: statusFilter || undefined
            });
            setControls(response.items);
            // Use actual total from API response
            setTotalCount(response.total);
            setError(null);
        } catch (err) {
            console.error('Error fetching controls:', err);
            setError('Failed to load controls. Please check your connection.');
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, search, statusFilter, viewMode]);

    useEffect(() => {
        fetchControls();
    }, [fetchControls]);

    useEffect(() => {
        const fetchPending = async () => {
            try {
                const response = await approvalsApi.list({ status: 'pending', limit: 1000 });
                const ids = new Set(
                    response.items
                        .filter(a => a.resource_type === 'control')
                        .map(a => a.resource_id)
                );
                setPendingApprovalIds(ids);
            } catch (error) {
                console.error('Failed to fetch pending approvals:', error);
            }
        };
        fetchPending();
    }, []);

    const handleExportPdf = async () => {
        setIsExporting(true);
        try {
            await reportApi.downloadControlsPdf({ status: statusFilter || null });
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            await reportApi.downloadControlsExcel({ status: statusFilter || null });
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
            label: 'Name',
            sortable: true,
            render: (control) => (
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{control.name}</span>
                    {pendingApprovalIds.has(control.id) && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-amber-400/10 text-amber-400 border border-amber-400/20" title="Changes Pending Approval">
                            <Lock className="h-2.5 w-2.5" />
                            Pending
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: 'department_name',
            label: 'Department',
            sortable: true,
            render: (control) => (
                <span className="text-xs font-medium text-slate-300">{control.department_name || 'Unassigned'}</span>
            ),
        },
        {
            key: 'frequency',
            label: 'Frequency',
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
            label: 'Risk Level',
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
            label: 'Status',
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
            render: () => (
                <div className="text-right">
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                </div>
            ),
        },
    ], []);

    // Get group by field based on view mode
    const getGroupByField = (): keyof ControlSummary | null => {
        switch (viewMode) {
            case 'category': return 'control_form';
            case 'department': return 'department_name';
            case 'process': return 'frequency';
            default: return null;
        }
    };

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">Control Catalog</h2>
                    <p className="text-slate-500 font-medium tracking-tight">Manage and audit organizational risk controls according to the 13-point standard.</p>
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
                    <PermissionGate resource="controls" action="write">
                        <button
                            onClick={() => navigate('/controls/new')}
                            className="btn-primary"
                        >
                            <Plus className="h-5 w-5" />
                            New Control
                        </button>
                    </PermissionGate>
                </div>
            </div>

            {/* View Switcher */}
            <ViewSwitcher value={viewMode} onChange={setViewMode} />

            {/* Filters Bar */}
            <div className="glass-card flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                    <input
                        type="text"
                        placeholder="Search by name or description..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                    />
                </div>
                <div className="flex gap-4">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-300 outline-none focus:border-accent/50 appearance-none min-w-[140px]"
                    >
                        <option value="" className="bg-slate-900">All Statuses</option>
                        <option value="active" className="bg-slate-900">Active</option>
                        <option value="draft" className="bg-slate-900">Draft</option>
                        <option value="inactive" className="bg-slate-900">Inactive</option>
                    </select>
                    <button
                        onClick={() => fetchControls()}
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
                        <p className="text-white font-bold text-xl">Error Loading Controls</p>
                        <p className="text-slate-500 max-w-sm mx-auto">{error}</p>
                    </div>
                    <button onClick={fetchControls} className="text-accent font-bold hover:underline">Try Again</button>
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
                        emptyMessage="No controls found matching your criteria."
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
                    data={controls}
                    groupBy={getGroupByField() as keyof ControlSummary}
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
                            emptyMessage="No controls in this category."
                        />
                    )}
                    renderItem={(control) => (
                        <div
                            onClick={() => navigate(`/controls/${control.id}`)}
                            className="px-6 py-4 hover:bg-white/5 cursor-pointer flex items-center justify-between"
                        >
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-bold text-white">{control.name}</span>
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getStatusColor(control.status)}`}>
                                    {control.status}
                                </span>
                            </div>
                            <div className="flex items-center gap-4">
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
        </div>
    );
}
