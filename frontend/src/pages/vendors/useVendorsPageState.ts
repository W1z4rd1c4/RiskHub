import { useCallback, useEffect } from 'react';

import type { SortDirection, ViewMode } from '@/components/tables';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { apiClient } from '@/services/apiClient';
import { reportApi } from '@/services/reportApi';
import { vendorApi } from '@/services/vendorApi';
import type { Vendor, VendorListParams, VendorType } from '@/types/vendor';

import {
    buildVendorExportFilters,
    buildVendorListParams,
    getVendorGroupBy,
    type VendorArchiveFilter,
} from './vendorsPagePresentation';
import {
    type RegisterPageExportRequest,
    type RegisterPageLoadRequest,
    useRegisterPageController,
} from '../shared/useRegisterPageController';

type VendorRegisterFilters = {
    sortDirection: SortDirection;
    sortField: VendorListParams['sort_by'] | null;
    statusFilter: VendorArchiveFilter;
    typeFilter: VendorType | '';
};

export function useVendorsPageState() {
    const loadVendorPage = useCallback(
        ({
            currentPage,
            debouncedSearch,
            filters,
            groupBy,
            groupValue,
            limit,
        }: RegisterPageLoadRequest<VendorRegisterFilters, ViewMode>) => vendorApi.getVendors(
            buildVendorListParams({
                currentPage,
                debouncedSearch,
                includeArchived: filters.statusFilter !== 'active',
                limit,
                sortDirection: filters.sortDirection,
                sortField: filters.sortField,
                typeFilter: filters.typeFilter,
                groupBy,
                groupValue,
            })
        ),
        []
    );

    const toUiErrorKey = useCallback((error: unknown) => apiClient.toUiMessageKey(error), []);

    const submitExport = useCallback(
        async ({
            format,
            asOfDate,
            filters,
            search,
        }: RegisterPageExportRequest<VendorRegisterFilters, ViewMode>) => {
            await reportApi.exportVendors({
                format,
                asOfDate,
                filters: buildVendorExportFilters({
                    statusFilter: filters.statusFilter,
                    search,
                    typeFilter: filters.typeFilter,
                }),
            });
        },
        []
    );

    const registerController = useRegisterPageController<Vendor, VendorRegisterFilters, ViewMode>({
        clearOnNonForbidden: true,
        fallbackErrorKey: 'errors.load_failed',
        getGroupBy: getVendorGroupBy,
        initialFilters: {
            sortDirection: null,
            sortField: null,
            statusFilter: 'active',
            typeFilter: '',
        },
        initialViewMode: 'all',
        loadPage: loadVendorPage,
        submitExport,
        toErrorKey: toUiErrorKey,
        toExportErrorKey: toUiErrorKey,
    });
    const {
        closeExportDialog,
        fetchCollection: fetchVendors,
        isExportDialogOpen,
        isExporting,
        openExportDialog,
        clearSelectedGroup,
        selectedGroupLabel,
        selectedGroupValue,
        setErrorKey,
        selectGroup,
        updateFilter,
        updateFilters,
        updateViewMode,
    } = registerController;

    useEffect(() => {
        if (
            !resolveCapabilityFlag(registerController.capabilities, 'can_view_risk_contexts') &&
            registerController.viewMode === 'risk'
        ) {
            updateViewMode('all');
        }
    }, [registerController.capabilities, registerController.viewMode, updateViewMode]);

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

    const updateStatusFilter = useCallback((value: VendorArchiveFilter) => {
        updateFilter('statusFilter', value);
    }, [updateFilter]);

    const updateTypeFilter = useCallback((value: VendorType | '') => {
        updateFilter('typeFilter', value);
    }, [updateFilter]);

    const updateSort = useCallback((sortField: VendorListParams['sort_by'] | null, sortDirection: SortDirection) => {
        updateFilters({ sortDirection, sortField });
    }, [updateFilters]);

    return {
        currentPage: registerController.currentPage,
        capabilities: registerController.capabilities,
        errorKey: registerController.errorKey,
        fetchVendors,
        groups: registerController.groups,
        handleExport: registerController.handleExport,
        hasLoadedOnce: registerController.hasLoadedOnce,
        isExportDialogOpen,
        isExporting,
        isAccessDenied: registerController.isAccessDenied,
        isLoading: registerController.isLoading,
        items: registerController.items,
        limit: registerController.limit,
        openExportDialog,
        closeExportDialog,
        restoreVendor,
        search: registerController.search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage: registerController.setCurrentPage,
        sortDirection: registerController.filters.sortDirection,
        sortField: registerController.filters.sortField,
        statusFilter: registerController.filters.statusFilter,
        totalCount: registerController.totalCount,
        totalPages: registerController.totalPages,
        typeFilter: registerController.filters.typeFilter,
        updateSearch: registerController.updateSearch,
        updateSort,
        updateStatusFilter,
        updateTypeFilter,
        updateViewMode,
        viewMode: registerController.viewMode,
        selectGroup,
        clearSelectedGroup,
    };
}
