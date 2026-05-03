import { useCallback, useEffect, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { SortDirection, ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { apiClient } from '@/services/apiClient';
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
} from '../shared/collectionPageState';
import {
    type CollectionWorkflowLoadRequest,
    useCollectionPageWorkflow,
} from '../shared/collectionPageWorkflow';
import { resetCollectionGroupAndPage } from '../shared/collectionViewVocabulary';

export function useVendorsPageState() {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<VendorStatus | ''>('active');
    const [typeFilter, setTypeFilter] = useState<VendorType | ''>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState<VendorListParams['sort_by'] | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);
    const includeArchived = statusFilter === 'inactive';
    const groupBy = getVendorGroupBy(viewMode);

    const loadVendorPage = useCallback(
        ({ currentPage, groupBy, groupValue }: CollectionWorkflowLoadRequest) => vendorApi.getVendors(
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
        [
            debouncedSearch,
            includeArchived,
            limit,
            sortDirection,
            sortField,
            statusFilter,
            typeFilter,
        ]
    );

    const toUiErrorKey = useCallback((error: unknown) => apiClient.toUiMessageKey(error), []);

    const collectionWorkflow = useCollectionPageWorkflow<Vendor>({
        clearOnNonForbidden: true,
        currentPage,
        groupBy,
        loadPage: loadVendorPage,
        toErrorKey: toUiErrorKey,
    });
    const {
        closeExportDialog,
        fetchCollection: fetchVendors,
        isExportDialogOpen,
        isExporting,
        openExportDialog,
        resetGroupSelection: clearGroupSelection,
        selectGroup: setSelectedGroup,
        selectedGroupLabel,
        selectedGroupValue,
        setErrorKey,
        setIsExporting,
    } = collectionWorkflow;

    useEffect(() => {
        void fetchVendors();
    }, [fetchVendors]);

    useEffect(() => {
        if (collectionWorkflow.capabilities?.can_view_risk_contexts !== true && viewMode === 'risk') {
            setViewMode('all');
            clearGroupSelection();
        }
    }, [collectionWorkflow.capabilities, clearGroupSelection, viewMode]);

    const resetGroupSelection = useCallback(() => {
        resetCollectionGroupAndPage(clearGroupSelection, setCurrentPage);
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
        capabilities: collectionWorkflow.capabilities,
        errorKey: collectionWorkflow.errorKey,
        fetchVendors,
        groups: collectionWorkflow.groups,
        handleExport,
        hasLoadedOnce: collectionWorkflow.hasLoadedOnce,
        isExportDialogOpen,
        isExporting,
        isAccessDenied: collectionWorkflow.isAccessDenied,
        isLoading: collectionWorkflow.isLoading,
        items: collectionWorkflow.items,
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
        totalCount: collectionWorkflow.totalCount,
        totalPages: getTotalPages(collectionWorkflow.totalCount, limit),
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
