import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { Plus, Search, RefreshCw, AlertCircle, Building2, User, ChevronRight, Download } from 'lucide-react';
import { vendorApi } from '@/services/vendorApi';
import { reportApi } from '@/services/reportApi';
import { apiClient } from '@/services/apiClient';
import type { Vendor, VendorStatus, VendorType } from '@/types/vendor';
import { PermissionGate } from '@/components/PermissionGate';
import { SortableTable, Pagination } from '@/components/tables';
import type { Column, SortDirection } from '@/components/tables/SortableTable';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAuth } from '@/contexts/AuthContext';
import { ExportDialog, type ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';

function scorePill(score: number) {
    if (score >= 5) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
    if (score >= 4) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
    if (score >= 3) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    if (score >= 2) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
}

export function VendorsPage() {
    const navigate = useNavigate();
    const { t } = useTranslation('vendors');

    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<VendorStatus | ''>('active');
    const [typeFilter, setTypeFilter] = useState<VendorType | ''>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const hasLoadedVendorsRef = useRef(false);

    const limit = DEFAULT_LIST_PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    const debouncedSearch = useDebouncedValue(search, 300);
    const { hasPermission } = useAuth();

    const fetchVendors = useCallback(async () => {
        try {
            const shouldShowSkeleton = !hasLoadedVendorsRef.current;
            if (shouldShowSkeleton) setIsLoading(true);

            const skip = (currentPage - 1) * limit;
            const shouldIncludeArchived = statusFilter === 'inactive';
            const res = await vendorApi.getVendors({
                skip,
                limit,
                search: debouncedSearch || undefined,
                status: (statusFilter as VendorStatus) || undefined,
                include_archived: shouldIncludeArchived,
                vendor_type: (typeFilter as VendorType) || undefined,
                sort_by: sortField || undefined,
                sort_order: (sortDirection as 'asc' | 'desc') || undefined,
            });

            setVendors(res.items);
            setTotalCount(res.total);
            setErrorKey(null);
            hasLoadedVendorsRef.current = true;
        } catch (err) {
            console.error('Error fetching vendors:', err);
            setErrorKey(apiClient.toUiMessageKey(err));
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, debouncedSearch, limit, sortDirection, sortField, statusFilter, typeFilter]);

    const handleRestoreVendor = useCallback(async (vendorId: number, e: MouseEvent) => {
        e.stopPropagation();
        try {
            await vendorApi.restoreVendor(vendorId);
            await fetchVendors();
        } catch (err) {
            console.error('Error restoring vendor:', err);
        }
    }, [fetchVendors]);

    useEffect(() => {
        fetchVendors();
    }, [fetchVendors]);

    const columns: Column<Vendor>[] = useMemo(() => [
        {
            key: 'name',
            label: t('columns.name'),
            sortable: true,
            render: (vendor) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-white">{vendor.name}</span>
                    <span className="text-[10px] text-slate-500">{vendor.process}</span>
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
                <span className="text-xs font-medium text-slate-400">{t(`type.${vendor.vendor_type}`, vendor.vendor_type)}</span>
            ),
        },
        {
            key: 'risk_score_1_5',
            label: t('columns.risk_score'),
            sortable: true,
            className: 'text-center',
            render: (vendor) => (
                <div className="flex justify-center">
                    <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${scorePill(vendor.risk_score_1_5)}`}>
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
                            onClick={(e) => handleRestoreVendor(vendor.id, e)}
                            data-testid={`vendor-unarchive-${vendor.id}`}
                            className="px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-[10px] font-black uppercase tracking-wider"
                        >
                            {t('actions.unarchive')}
                        </button>
                    )}
                    <ChevronRight className="h-4 w-4 text-slate-500 ml-auto" />
                </div>
            )
        }
    ], [handleRestoreVendor, hasPermission, t]);

    const handleSort = (field: string, direction: SortDirection) => {
        setSortField(direction ? field : null);
        setSortDirection(direction);
        setCurrentPage(1);
        setVendors([]);
    };

    const handleExport = async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
        setIsExporting(true);
        try {
            await reportApi.exportVendors({
                format,
                asOfDate,
                filters: {
                    status: statusFilter || null,
                    search: search.trim() || null,
                    vendorType: typeFilter || null,
                },
            });
            setIsExportDialogOpen(false);
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
                    <p className="text-slate-500 font-medium mt-1">{t('subtitle')}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsExportDialogOpen(true)}
                        data-testid="vendors-export-button"
                        disabled={isExporting}
                        className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-semibold"
                    >
                        <Download className="h-4 w-4" />
                        {t('actions.export')}
                    </button>
                    <PermissionGate resource="vendors" action="write">
                        <button
                            onClick={() => navigate('/vendors/new')}
                            data-testid="vendors-create-button"
                            className="px-5 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-all flex items-center gap-2"
                        >
                            <Plus className="h-5 w-5" />
                            {t('actions.new')}
                        </button>
                    </PermissionGate>
                </div>
            </div>

            <div className="glass-card flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                    <input
                        data-testid="vendors-search-input"
                        type="text"
                        placeholder={t('filters.search_placeholder')}
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); setVendors([]); }}
                        className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                    />
                </div>
                <div className="flex gap-4">
                    <ThemedSelect
                        value={statusFilter}
                        onValueChange={(v) => {
                            setStatusFilter(v as VendorStatus | '');
                            setCurrentPage(1);
                            setVendors([]);
                        }}
                        placeholder={t('filters.all_statuses')}
                        allowEmpty
                        emptyLabel={t('filters.all_statuses')}
                        triggerTestId="vendors-status-filter-trigger"
                        contentTestId="vendors-status-filter-content"
                        optionTestIdPrefix="vendors-status-filter-option"
                        options={[
                            { value: 'active', label: t('status.active') },
                            { value: 'inactive', label: t('status.inactive') },
                        ]}
                    />
                    <ThemedSelect
                        value={typeFilter}
                        onValueChange={(v) => { setTypeFilter(v as VendorType | ''); setCurrentPage(1); setVendors([]); }}
                        placeholder={t('filters.all_types')}
                        allowEmpty
                        emptyLabel={t('filters.all_types')}
                        triggerTestId="vendors-type-filter-trigger"
                        contentTestId="vendors-type-filter-content"
                        optionTestIdPrefix="vendors-type-filter-option"
                        options={[
                            { value: 'ict', label: t('type.ict') },
                            { value: 'outsourcing', label: t('type.outsourcing') },
                            { value: 'professional_services', label: t('type.professional_services') },
                            { value: 'partner', label: t('type.partner') },
                            { value: 'other', label: t('type.other') },
                        ]}
                    />
                    <button
                        onClick={() => { fetchVendors(); setVendors([]); }}
                        data-testid="vendors-refresh-button"
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors"
                    >
                        <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
                    </button>
                </div>
            </div>

            {errorKey ? (
                <div className="glass-card p-20 flex flex-col items-center justify-center text-center gap-4">
                    <AlertCircle className="h-12 w-12 text-rose-500" />
                    <div>
                        <p className="text-white font-bold text-xl">{t('errors.title')}</p>
                        <p className="text-slate-500 max-w-sm mx-auto">{t(errorKey, { ns: 'errorKeys' })}</p>
                    </div>
                    <button onClick={fetchVendors} className="text-accent font-bold hover:underline">{t('errors.try_again')}</button>
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
            ) : (
                <>
                    <SortableTable
                        data={vendors}
                        columns={columns}
                        keyExtractor={(v) => v.id}
                        onRowClick={(v) => navigate(`/vendors/${v.id}`)}
                        emptyMessage={t('empty_state.no_vendors')}
                        onSort={handleSort}
                        sortKey={sortField}
                        sortDirection={sortDirection}
                    />
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalCount}
                        itemsPerPage={limit}
                        onPageChange={(p) => { setCurrentPage(p); setVendors([]); }}
                    />
                </>
            )}

            <ExportDialog
                isOpen={isExportDialogOpen}
                onClose={() => setIsExportDialogOpen(false)}
                onSubmit={handleExport}
                isSubmitting={isExporting}
                dataTestId="vendors-export-dialog"
            />
        </div>
    );
}
