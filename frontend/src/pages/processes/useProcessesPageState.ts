import { useCallback } from 'react';

import type { SortDirection } from '@/components/tables';
import { apiClient } from '@/services/apiClient';
import { processApi } from '@/services/processApi';
import type { Process, ProcessSortField } from '@/types/process';

import {
    buildProcessListParams,
    type ProcessArchiveFilter,
} from './processesPagePresentation';
import {
    type RegisterPageLoadRequest,
    useRegisterPageController,
} from '../shared/useRegisterPageController';

type ProcessRegisterFilters = {
    sortDirection: SortDirection;
    sortField: ProcessSortField | null;
    statusFilter: ProcessArchiveFilter;
};

export function useProcessesPageState() {
    const loadProcessPage = useCallback(
        ({
            currentPage,
            debouncedSearch,
            filters,
            limit,
        }: RegisterPageLoadRequest<ProcessRegisterFilters, 'all'>) => processApi.getProcesses(
            buildProcessListParams({
                currentPage,
                debouncedSearch,
                includeArchived: filters.statusFilter !== 'active',
                limit,
                sortDirection: filters.sortDirection,
                sortField: filters.sortField,
            })
        ),
        []
    );

    const toUiErrorKey = useCallback((error: unknown) => apiClient.toUiMessageKey(error), []);

    const registerController = useRegisterPageController<Process, ProcessRegisterFilters, 'all'>({
        clearOnNonForbidden: true,
        fallbackErrorKey: 'errors.load_failed',
        getGroupBy: () => null,
        initialFilters: {
            sortDirection: null,
            sortField: null,
            statusFilter: 'active',
        },
        initialViewMode: 'all',
        loadPage: loadProcessPage,
        submitExport: () => Promise.resolve(),
        toErrorKey: toUiErrorKey,
    });
    const { fetchCollection: fetchProcesses, setErrorKey, updateFilter, updateFilters } = registerController;

    const restoreProcess = useCallback(
        async (processId: number) => {
            try {
                await processApi.restoreProcess(processId);
                await fetchProcesses();
            } catch (error) {
                setErrorKey(apiClient.toUiMessageKey(error));
            }
        },
        [fetchProcesses, setErrorKey]
    );

    const updateStatusFilter = useCallback((value: ProcessArchiveFilter) => {
        updateFilter('statusFilter', value);
    }, [updateFilter]);

    const updateSort = useCallback((sortField: ProcessSortField | null, sortDirection: SortDirection) => {
        updateFilters({ sortDirection, sortField });
    }, [updateFilters]);

    return {
        capabilities: registerController.capabilities,
        currentPage: registerController.currentPage,
        errorKey: registerController.errorKey,
        fetchProcesses,
        hasLoadedOnce: registerController.hasLoadedOnce,
        isAccessDenied: registerController.isAccessDenied,
        isLoading: registerController.isLoading,
        items: registerController.items,
        limit: registerController.limit,
        restoreProcess,
        search: registerController.search,
        setCurrentPage: registerController.setCurrentPage,
        sortDirection: registerController.filters.sortDirection,
        sortField: registerController.filters.sortField,
        statusFilter: registerController.filters.statusFilter,
        totalCount: registerController.totalCount,
        totalPages: registerController.totalPages,
        updateSearch: registerController.updateSearch,
        updateSort,
        updateStatusFilter,
    };
}
