import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Plus, RefreshCw, Search } from 'lucide-react';

import { PermissionGate } from '@/components/PermissionGate';
import { ExportDialog, type ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import { ViewSwitcher, type SortDirection, type ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/i18n/hooks';
import { apiClient } from '@/services/apiClient';
import { reportApi } from '@/services/reportApi';
import { vendorApi } from '@/services/vendorApi';
import type { Vendor, VendorListParams, VendorStatus, VendorType } from '@/types/vendor';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

import { VendorsTableSection } from './vendors/VendorsTableSection';
import {
    buildVendorExportFilters,
    buildVendorListParams,
    fetchAllVendorsForGroupedView,
} from './vendors/vendorsPagePresentation';

export function VendorsPage() {
    const navigate = useNavigate();
    const { t } = useTranslation('vendors');
    const { hasPermission } = usePermissions();

    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<VendorStatus | ''>('active');
    const [typeFilter, setTypeFilter] = useState<VendorType | ''>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState<VendorListParams['sort_by'] | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const latestRequestIdRef = useRef(0);
    const hasLoadedVendorsRef = useRef(false);

    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);
    const includeArchived = statusFilter === 'inactive';
    const canReadRisks = hasPermission('risks', 'read');

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    const listParams = useMemo(
        () =>
            buildVendorListParams({
                currentPage,
                debouncedSearch,
                includeArchived,
                limit,
                sortDirection,
                sortField,
                statusFilter,
                typeFilter,
            }),
        [
            currentPage,
            debouncedSearch,
            includeArchived,
            limit,
            sortDirection,
            sortField,
            statusFilter,
            typeFilter,
        ]
    );

    const fetchVendors = useCallback(async () => {
        const requestId = ++latestRequestIdRef.current;

        try {
            setIsLoading(true);

            const response =
                viewMode === 'all'
                    ? await vendorApi.getVendors(listParams)
                    : await fetchAllVendorsForGroupedView({
                        debouncedSearch,
                        includeArchived,
                        sortDirection,
                        sortField,
                        statusFilter,
                        typeFilter,
                    });

            if (requestId !== latestRequestIdRef.current) {
                return;
            }

            setVendors(response.items);
            setTotalCount(response.total);
            setErrorKey(null);
            hasLoadedVendorsRef.current = true;
        } catch (err) {
            if (requestId !== latestRequestIdRef.current) {
                return;
            }
            console.error('Error fetching vendors:', err);
            setErrorKey(apiClient.toUiMessageKey(err));
            setVendors([]);
            setTotalCount(0);
        } finally {
            if (requestId === latestRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [
        debouncedSearch,
        includeArchived,
        listParams,
        sortDirection,
        sortField,
        statusFilter,
        typeFilter,
        viewMode,
    ]);

    const handleRestoreVendor = useCallback(
        async (vendorId: number) => {
            try {
                await vendorApi.restoreVendor(vendorId);
                await fetchVendors();
            } catch (err) {
                console.error('Error restoring vendor:', err);
            }
        },
        [fetchVendors]
    );

    useEffect(() => {
        void fetchVendors();
    }, [fetchVendors]);

    useEffect(() => {
        if (!canReadRisks && viewMode === 'risk') {
            setViewMode('all');
        }
    }, [canReadRisks, viewMode]);

    const handleSort = useCallback(
        (field: VendorListParams['sort_by'] | null, direction: SortDirection) => {
            setSortField(field);
            setSortDirection(direction);
            setCurrentPage(1);
        },
        []
    );

    const handleExport = useCallback(
        async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
            setIsExporting(true);
            try {
                await reportApi.exportVendors({
                    format,
                    asOfDate,
                    filters: buildVendorExportFilters({
                        statusFilter,
                        search,
                        typeFilter,
                    }),
                });
                setIsExportDialogOpen(false);
            } catch (err) {
                console.error('Export failed:', err);
                setErrorKey(apiClient.toUiMessageKey(err));
            } finally {
                setIsExporting(false);
            }
        },
        [search, statusFilter, typeFilter]
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
                    <p className="text-slate-500 font-medium mt-1">{t('subtitle')}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
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
                            type="button"
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

            <ViewSwitcher
                value={viewMode}
                onChange={(mode) => {
                    setViewMode(mode);
                    setCurrentPage(1);
                }}
                exclude={canReadRisks ? ['category', 'risk_type', 'vendor'] : ['category', 'risk_type', 'risk', 'vendor']}
            />

            <div className="glass-card flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                    <input
                        data-testid="vendors-search-input"
                        type="text"
                        placeholder={t('filters.search_placeholder')}
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setCurrentPage(1);
                        }}
                        className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                    />
                </div>
                <div className="flex gap-4">
                    <ThemedSelect
                        value={statusFilter}
                        onValueChange={(value) => {
                            setStatusFilter(value as VendorStatus | '');
                            setCurrentPage(1);
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
                        onValueChange={(value) => {
                            setTypeFilter(value as VendorType | '');
                            setCurrentPage(1);
                        }}
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
                        type="button"
                        onClick={() => void fetchVendors()}
                        data-testid="vendors-refresh-button"
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors"
                    >
                        <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
                    </button>
                </div>
            </div>

            <VendorsTableSection
                currentPage={currentPage}
                errorKey={errorKey}
                hasLoadedOnce={hasLoadedVendorsRef.current}
                isLoading={isLoading}
                items={vendors}
                itemsPerPage={limit}
                onPageChange={setCurrentPage}
                onRestoreVendor={(vendorId) => void handleRestoreVendor(vendorId)}
                onRetry={() => void fetchVendors()}
                onRowClick={(vendor) => navigate(`/vendors/${vendor.id}`)}
                onSortChange={handleSort}
                sortDirection={sortDirection}
                sortField={sortField}
                totalCount={totalCount}
                totalPages={totalPages}
                viewMode={viewMode}
            />

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

export default VendorsPage;
