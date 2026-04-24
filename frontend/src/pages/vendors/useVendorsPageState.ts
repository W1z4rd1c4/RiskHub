import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { SortDirection, ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { apiClient } from '@/services/apiClient';
import { reportApi } from '@/services/reportApi';
import { vendorApi } from '@/services/vendorApi';
import type { CollectionGroup } from '@/types/collection';
import type { Vendor, VendorListParams, VendorStatus, VendorType } from '@/types/vendor';

import {
    buildVendorExportFilters,
    buildVendorListParams,
    getVendorGroupBy,
} from './vendorsPagePresentation';

interface UseVendorsPageStateOptions {
    canReadRisks: boolean;
}

export function useVendorsPageState({ canReadRisks }: UseVendorsPageStateOptions) {
    const [items, setItems] = useState<Vendor[]>([]);
    const [groups, setGroups] = useState<CollectionGroup[]>([]);
    const [selectedGroupValue, setSelectedGroupValue] = useState<string | null>(null);
    const [selectedGroupLabel, setSelectedGroupLabel] = useState<string | null>(null);
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
    const groupBy = getVendorGroupBy(viewMode);

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

            let response;
            if (!groupBy) {
                response = await vendorApi.getVendors(listParams);
            } else if (selectedGroupValue) {
                response = await vendorApi.getVendors(
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
                        groupValue: selectedGroupValue,
                    })
                );
            } else {
                response = await vendorApi.getVendors(
                    buildVendorListParams({
                        currentPage: 1,
                        debouncedSearch,
                        includeArchived,
                        limit,
                        sortDirection,
                        sortField,
                        statusFilter,
                        typeFilter,
                        groupBy,
                    })
                );
            }

            if (requestId !== latestRequestIdRef.current) {
                return;
            }

            setItems(response.items);
            setGroups(response.groups ?? []);
            setTotalCount(response.total);
            setErrorKey(null);
            hasLoadedVendorsRef.current = true;
        } catch (error) {
            if (requestId !== latestRequestIdRef.current) {
                return;
            }
            setErrorKey(apiClient.toUiMessageKey(error));
            setItems([]);
            setGroups([]);
            setTotalCount(0);
        } finally {
            if (requestId === latestRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [
        currentPage,
        debouncedSearch,
        groupBy,
        includeArchived,
        limit,
        listParams,
        selectedGroupValue,
        sortDirection,
        sortField,
        statusFilter,
        typeFilter,
    ]);

    useEffect(() => {
        void fetchVendors();
    }, [fetchVendors]);

    useEffect(() => {
        if (!canReadRisks && viewMode === 'risk') {
            setViewMode('all');
            setSelectedGroupValue(null);
            setSelectedGroupLabel(null);
        }
    }, [canReadRisks, viewMode]);

    const resetGroupSelection = useCallback(() => {
        setSelectedGroupValue(null);
        setSelectedGroupLabel(null);
        setCurrentPage(1);
    }, []);

    const restoreVendor = useCallback(
        async (vendorId: number) => {
            try {
                await vendorApi.restoreVendor(vendorId);
                await fetchVendors();
            } catch (error) {
                setErrorKey(apiClient.toUiMessageKey(error));
            }
        },
        [fetchVendors]
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
            } catch (error) {
                setErrorKey(apiClient.toUiMessageKey(error));
            } finally {
                setIsExporting(false);
            }
        },
        [search, statusFilter, typeFilter]
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
        setSelectedGroupValue(groupValue);
        setSelectedGroupLabel(groupLabel);
        setCurrentPage(1);
    }, []);

    return {
        currentPage,
        errorKey,
        fetchVendors,
        groups,
        handleExport,
        hasLoadedOnce: hasLoadedVendorsRef.current,
        isExportDialogOpen,
        isExporting,
        isLoading,
        items,
        limit,
        openExportDialog: () => setIsExportDialogOpen(true),
        closeExportDialog: () => setIsExportDialogOpen(false),
        restoreVendor,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        sortDirection,
        sortField,
        statusFilter,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
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
