import { useCallback, useEffect, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE, LIST_SEARCH_DEBOUNCE_MS } from '@/constants/list';
import { KRI_MONITORING_FILTER_VALUES } from '@/lib/monitoringStatus';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { apiClient } from '@/services/apiClient';
import { loadCollectionPage } from '@/services/collectionApi';
import { kriApi } from '@/services/kriApi';
import { reportApi } from '@/services/reportApi';
import type { KeyRiskIndicator } from '@/types/kri';

import {
    ARCHIVED_ROUTE_VALUE,
    ARCHIVED_STATUS_PARAM,
    buildKriExportFilters,
    buildKriListParams,
    getKriGroupBy,
    readKriRouteFilters,
    type KriStatusFilter,
    type KriTimelinessFilter,
} from './kriPagePresentation';
import {
    getTotalPages,
    useCollectionDataState,
    useCollectionPageController,
} from '../shared/collectionPageState';

const TIMELINESS_FILTER_VALUES = ['due_soon'] as const;

interface UseKrisPageStateOptions {
    searchParams: URLSearchParams;
    setSearchParams: (nextParams: URLSearchParams, options?: { replace?: boolean }) => void;
}

export function useKrisPageState({ searchParams, setSearchParams }: UseKrisPageStateOptions) {
    const collectionData = useCollectionDataState<KeyRiskIndicator>();
    const {
        applyFailure,
        applySuccess,
        setErrorKey,
        setIsLoading,
    } = collectionData;
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const {
        beginRequest,
        closeExportDialog,
        isCurrentRequest,
        isExportDialogOpen,
        isExporting,
        openExportDialog,
        resetGroupSelection,
        selectGroup: selectCollectionGroup,
        selectedGroupLabel,
        selectedGroupValue,
        setIsExporting,
    } = useCollectionPageController();

    const { statusFilter, timelinessFilter } = readKriRouteFilters(
        searchParams,
        KRI_MONITORING_FILTER_VALUES,
        TIMELINESS_FILTER_VALUES
    );
    const debouncedSearch = useDebouncedValue(search, LIST_SEARCH_DEBOUNCE_MS);
    const limit = DEFAULT_LIST_PAGE_SIZE;
    const groupBy = getKriGroupBy(viewMode);

    const fetchKris = useCallback(async () => {
        const requestId = beginRequest();
        try {
            setIsLoading(true);

            const response = await loadCollectionPage({
                currentPage,
                groupBy,
                selectedGroupValue,
                loadPage: ({ currentPage, groupBy, groupValue }) => kriApi.getKRIs(
                    buildKriListParams({
                        currentPage,
                        limit,
                        search: debouncedSearch,
                        statusFilter,
                        timelinessFilter,
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
        isCurrentRequest,
        limit,
        selectedGroupValue,
        setIsLoading,
        statusFilter,
        timelinessFilter,
    ]);

    useEffect(() => {
        void fetchKris();
    }, [fetchKris]);

    const updateRouteFilters = useCallback((nextStatusFilter: KriStatusFilter, nextTimelinessFilter: KriTimelinessFilter) => {
        setCurrentPage(1);
        resetGroupSelection();

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('monitoring_status');
        nextParams.delete('timeliness_status');
        nextParams.delete(ARCHIVED_STATUS_PARAM);

        if (nextTimelinessFilter) {
            nextParams.set('timeliness_status', nextTimelinessFilter);
        } else if (nextStatusFilter === 'archived') {
            nextParams.set(ARCHIVED_STATUS_PARAM, ARCHIVED_ROUTE_VALUE);
        } else if (nextStatusFilter !== 'all') {
            nextParams.set('monitoring_status', nextStatusFilter);
        }

        setSearchParams(nextParams, { replace: true });
    }, [resetGroupSelection, searchParams, setSearchParams]);

    const updateViewMode = useCallback((nextViewMode: ViewMode) => {
        setViewMode(nextViewMode);
        setCurrentPage(1);
        resetGroupSelection();
    }, [resetGroupSelection]);

    const updateSearch = useCallback((value: string) => {
        setSearch(value);
        setCurrentPage(1);
        resetGroupSelection();
    }, [resetGroupSelection]);

    const selectGroup = useCallback((groupValue: string, groupLabel: string) => {
        selectCollectionGroup(groupValue, groupLabel);
        setCurrentPage(1);
    }, [selectCollectionGroup]);

    const clearSelectedGroup = useCallback(() => {
        resetGroupSelection();
        setCurrentPage(1);
    }, [resetGroupSelection]);

    const restoreKri = useCallback(async (kriId: number) => {
        try {
            await kriApi.restoreKRI(kriId);
            await fetchKris();
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        }
    }, [fetchKris, setErrorKey]);

    const handleExport = useCallback(async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
        setIsExporting(true);
        try {
            await reportApi.exportKRIs({
                format,
                asOfDate,
                filters: buildKriExportFilters({
                    search,
                    statusFilter,
                    timelinessFilter,
                }),
            });
            closeExportDialog();
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setIsExporting(false);
        }
    }, [closeExportDialog, search, setErrorKey, setIsExporting, statusFilter, timelinessFilter]);

    return {
        currentPage,
        capabilities: collectionData.capabilities,
        errorKey: collectionData.errorKey,
        fetchKris,
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
        restoreKri,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        statusFilter,
        timelinessFilter,
        totalCount: collectionData.totalCount,
        totalPages: getTotalPages(collectionData.totalCount, limit),
        updateRouteFilters,
        updateSearch,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup,
    };
}
