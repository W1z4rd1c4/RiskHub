import { useCallback, useEffect, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { SortDirection, ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { apiClient } from '@/services/apiClient';
import { loadCollectionPage } from '@/services/collectionApi';
import { reportApi } from '@/services/reportApi';
import { vendorApi } from '@/services/vendorApi';
import type { Vendor, VendorListParams, VendorStatus, VendorType } from '@/types/vendor';

import {
    buildVendorExportFilters,
    buildVendorListParams,
    getVendorGroupBy,
} from './vendorsPagePresentation';
import {
    getTotalPages,
    useCollectionDataState,
    useCollectionPageController,
} from '../shared/collectionPageState';

export function useVendorsPageState() {
    const collectionData = useCollectionDataState<Vendor>();
    const {
        applyFailure,
        applySuccess,
        setErrorKey,
        setIsLoading,
    } = collectionData;
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<VendorStatus | ''>('active');
    const [typeFilter, setTypeFilter] = useState<VendorType | ''>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState<VendorListParams['sort_by'] | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const {
        beginRequest,
        closeExportDialog,
        isCurrentRequest,
        isExportDialogOpen,
        isExporting,
        openExportDialog,
        resetGroupSelection: clearGroupSelection,
        selectGroup: setSelectedGroup,
        selectedGroupLabel,
        selectedGroupValue,
        setIsExporting,
    } = useCollectionPageController();
    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);
    const includeArchived = statusFilter === 'inactive';
    const groupBy = getVendorGroupBy(viewMode);

    const fetchVendors = useCallback(async () => {
        const requestId = beginRequest();

        try {
            setIsLoading(true);

            const response = await loadCollectionPage({
                currentPage,
                groupBy,
                selectedGroupValue,
                loadPage: ({ currentPage, groupBy, groupValue }) => vendorApi.getVendors(
                    buildVendorListParams({
                        currentPage,
                        debouncedSearch,
                        includeArchived,
                        limit,
                        sortDirection,
                        sortField,
                        statusFilter,
                        typeFilter,
                        groupBy,
                        groupValue,
                    })
                ),
            });

            if (!isCurrentRequest(requestId)) {
                return;
            }

            applySuccess(response);
        } catch (error) {
            if (!isCurrentRequest(requestId)) {
                return;
            }
            applyFailure(error, {
                clearOnNonForbidden: true,
                toErrorKey: (loadError) => apiClient.toUiMessageKey(loadError),
            });
        } finally {
            if (isCurrentRequest(requestId)) {
                setIsLoading(false);
            }
        }
    }, [
        applyFailure,
        applySuccess,
        beginRequest,
        currentPage,
        debouncedSearch,
        groupBy,
        includeArchived,
        isCurrentRequest,
        limit,
        selectedGroupValue,
        setIsLoading,
        sortDirection,
        sortField,
        statusFilter,
        typeFilter,
    ]);

    useEffect(() => {
        void fetchVendors();
    }, [fetchVendors]);

    useEffect(() => {
        if (collectionData.capabilities?.can_view_risk_contexts !== true && viewMode === 'risk') {
            setViewMode('all');
            clearGroupSelection();
        }
    }, [collectionData.capabilities, clearGroupSelection, viewMode]);

    const resetGroupSelection = useCallback(() => {
        clearGroupSelection();
        setCurrentPage(1);
    }, [clearGroupSelection]);

    const restoreVendor = useCallback(
        async (vendorId: number) => {
            try {
                await vendorApi.restoreVendor(vendorId);
                await fetchVendors();
            } catch (error) {
                setErrorKey(apiClient.toUiMessageKey(error));
            }
        },
        [fetchVendors, setErrorKey]
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
                closeExportDialog();
            } catch (error) {
                setErrorKey(apiClient.toUiMessageKey(error));
            } finally {
                setIsExporting(false);
            }
        },
        [closeExportDialog, search, setErrorKey, setIsExporting, statusFilter, typeFilter]
    );

    const updateSearch = useCallback((value: string) => {
        setSearch(value);
        resetGroupSelection();
    }, [resetGroupSelection]);

    const updateStatusFilter = useCallback((value: VendorStatus | '') => {
        setStatusFilter(value);
        resetGroupSelection();
    }, [resetGroupSelection]);

    const updateTypeFilter = useCallback((value: VendorType | '') => {
        setTypeFilter(value);
        resetGroupSelection();
    }, [resetGroupSelection]);

    const updateSort = useCallback((field: VendorListParams['sort_by'] | null, direction: SortDirection) => {
        setSortField(field);
        setSortDirection(direction);
        resetGroupSelection();
    }, [resetGroupSelection]);

    const updateViewMode = useCallback((value: ViewMode) => {
        setViewMode(value);
        resetGroupSelection();
    }, [resetGroupSelection]);

    const selectGroup = useCallback((groupValue: string, groupLabel: string) => {
        setSelectedGroup(groupValue, groupLabel);
        setCurrentPage(1);
    }, [setSelectedGroup]);

    return {
        currentPage,
        capabilities: collectionData.capabilities,
        errorKey: collectionData.errorKey,
        fetchVendors,
        groups: collectionData.groups,
        handleExport,
        hasLoadedOnce: collectionData.hasLoadedOnce,
        isExportDialogOpen,
        isExporting,
        isAccessDenied: collectionData.isAccessDenied,
        isLoading: collectionData.isLoading,
        items: collectionData.items,
        limit,
        openExportDialog,
        closeExportDialog,
        restoreVendor,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        sortDirection,
        sortField,
        statusFilter,
        totalCount: collectionData.totalCount,
        totalPages: getTotalPages(collectionData.totalCount, limit),
        typeFilter,
        updateSearch,
        updateSort,
        updateStatusFilter,
        updateTypeFilter,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup: resetGroupSelection,
    };
}
