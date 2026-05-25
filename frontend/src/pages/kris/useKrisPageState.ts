import { useCallback, useEffect, useMemo } from 'react';

import type { ViewMode } from '@/components/tables';
import { LIST_SEARCH_DEBOUNCE_MS } from '@/constants/list';
import { KRI_MONITORING_FILTER_VALUES } from '@/lib/monitoringStatus';
import { apiClient } from '@/services/apiClient';
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
    type RegisterPageExportRequest,
    type RegisterPageLoadRequest,
    useRegisterPageController,
} from '../shared/useRegisterPageController';

const TIMELINESS_FILTER_VALUES = ['due_soon'] as const;

interface UseKrisPageStateOptions {
    searchParams: URLSearchParams;
    setSearchParams: (nextParams: URLSearchParams, options?: { replace?: boolean }) => void;
}

type KriRegisterFilters = {
    statusFilter: KriStatusFilter;
    timelinessFilter: KriTimelinessFilter;
};

export function useKrisPageState({ searchParams, setSearchParams }: UseKrisPageStateOptions) {
    const routeFilters = useMemo(
        () => readKriRouteFilters(
            searchParams,
            KRI_MONITORING_FILTER_VALUES,
            TIMELINESS_FILTER_VALUES
        ),
        [searchParams]
    );

    const loadKriPage = useCallback(
        ({
            currentPage,
            debouncedSearch,
            filters,
            groupBy,
            groupValue,
            limit,
        }: RegisterPageLoadRequest<KriRegisterFilters, ViewMode>) => kriApi.getKRIs(
            buildKriListParams({
                currentPage,
                limit,
                search: debouncedSearch,
                statusFilter: filters.statusFilter,
                timelinessFilter: filters.timelinessFilter,
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
        }: RegisterPageExportRequest<KriRegisterFilters, ViewMode>) => {
            await reportApi.exportKRIs({
                format,
                asOfDate,
                filters: buildKriExportFilters({
                    search,
                    statusFilter: filters.statusFilter,
                    timelinessFilter: filters.timelinessFilter,
                }),
            });
        },
        []
    );

    const registerController = useRegisterPageController<KeyRiskIndicator, KriRegisterFilters, ViewMode>({
        clearOnNonForbidden: true,
        fallbackErrorKey: 'errors.load_failed',
        getGroupBy: getKriGroupBy,
        initialFilters: routeFilters,
        initialViewMode: 'all',
        loadPage: loadKriPage,
        searchDebounceMs: LIST_SEARCH_DEBOUNCE_MS,
        submitExport,
        toErrorKey: toUiErrorKey,
        toExportErrorKey: toUiErrorKey,
    });
    const {
        closeExportDialog,
        fetchCollection: fetchKris,
        isExportDialogOpen,
        isExporting,
        openExportDialog,
        clearSelectedGroup,
        selectedGroupLabel,
        selectedGroupValue,
        setErrorKey,
        selectGroup,
        updateFilters,
        updateViewMode,
    } = registerController;

    useEffect(() => {
        if (
            registerController.filters.statusFilter !== routeFilters.statusFilter ||
            registerController.filters.timelinessFilter !== routeFilters.timelinessFilter
        ) {
            updateFilters(routeFilters);
        }
    }, [
        registerController.filters.statusFilter,
        registerController.filters.timelinessFilter,
        routeFilters,
        updateFilters,
    ]);

    const updateRouteFilters = useCallback((
        nextStatusFilter: KriStatusFilter,
        nextTimelinessFilter: KriTimelinessFilter,
    ) => {
        updateFilters({
            statusFilter: nextStatusFilter,
            timelinessFilter: nextTimelinessFilter,
        });

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
    }, [searchParams, setSearchParams, updateFilters]);

    const restoreKri = useCallback(async (kriId: number) => {
        try {
            await kriApi.restoreKRI(kriId);
            await fetchKris();
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        }
    }, [fetchKris, setErrorKey]);

    return {
        currentPage: registerController.currentPage,
        capabilities: registerController.capabilities,
        errorKey: registerController.errorKey,
        fetchKris,
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
        restoreKri,
        search: registerController.search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage: registerController.setCurrentPage,
        statusFilter: registerController.filters.statusFilter,
        timelinessFilter: registerController.filters.timelinessFilter,
        totalCount: registerController.totalCount,
        totalPages: registerController.totalPages,
        updateRouteFilters,
        updateSearch: registerController.updateSearch,
        updateViewMode,
        viewMode: registerController.viewMode,
        selectGroup,
        clearSelectedGroup,
    };
}
