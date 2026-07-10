import { useCallback } from 'react';

import type { SortDirection } from '@/components/tables';
import { apiClient } from '@/services/apiClient';
import { threatApi } from '@/services/threatApi';
import type { Threat, ThreatSortField } from '@/types/threat';

import {
    buildThreatListParams,
    type ThreatArchiveFilter,
} from './threatsPagePresentation';
import {
    type RegisterPageLoadRequest,
    useRegisterPageController,
} from '../shared/useRegisterPageController';

type ThreatRegisterFilters = {
    sortDirection: SortDirection;
    sortField: ThreatSortField | null;
    statusFilter: ThreatArchiveFilter;
};

export function useThreatsPageState() {
    const loadThreatPage = useCallback(
        ({
            currentPage,
            debouncedSearch,
            filters,
            limit,
        }: RegisterPageLoadRequest<ThreatRegisterFilters, 'all'>) => threatApi.getThreats(
            buildThreatListParams({
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

    const registerController = useRegisterPageController<Threat, ThreatRegisterFilters, 'all'>({
        clearOnNonForbidden: true,
        fallbackErrorKey: 'errors.load_failed',
        getGroupBy: () => null,
        initialFilters: {
            sortDirection: null,
            sortField: null,
            statusFilter: 'active',
        },
        initialViewMode: 'all',
        loadPage: loadThreatPage,
        submitExport: () => Promise.resolve(),
        toErrorKey: toUiErrorKey,
    });
    const { fetchCollection: fetchThreats, setErrorKey, updateFilter, updateFilters } = registerController;

    const restoreThreat = useCallback(
        async (threatId: number) => {
            try {
                await threatApi.restoreThreat(threatId);
                await fetchThreats();
            } catch (error) {
                setErrorKey(apiClient.toUiMessageKey(error));
            }
        },
        [fetchThreats, setErrorKey]
    );

    const updateStatusFilter = useCallback((value: ThreatArchiveFilter) => {
        updateFilter('statusFilter', value);
    }, [updateFilter]);

    const updateSort = useCallback((sortField: ThreatSortField | null, sortDirection: SortDirection) => {
        updateFilters({ sortDirection, sortField });
    }, [updateFilters]);

    return {
        capabilities: registerController.capabilities,
        currentPage: registerController.currentPage,
        errorKey: registerController.errorKey,
        fetchThreats,
        hasLoadedOnce: registerController.hasLoadedOnce,
        isAccessDenied: registerController.isAccessDenied,
        isLoading: registerController.isLoading,
        items: registerController.items,
        limit: registerController.limit,
        restoreThreat,
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
