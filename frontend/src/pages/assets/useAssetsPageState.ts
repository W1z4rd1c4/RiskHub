import { useCallback } from 'react';

import type { SortDirection } from '@/components/tables';
import { apiClient } from '@/services/apiClient';
import { assetApi } from '@/services/assetApi';
import type { Asset, AssetSortField } from '@/types/asset';

import { buildAssetListParams, type AssetArchiveFilter } from './assetsPagePresentation';
import { type RegisterPageLoadRequest, useRegisterPageController } from '../shared/useRegisterPageController';
import type { AssetSemanticFilters } from '../shared/ictRegisterSemanticFilters';

type AssetRegisterFilters = {
    sortDirection: SortDirection;
    sortField: AssetSortField | null;
    statusFilter: AssetArchiveFilter;
};

export function useAssetsPageState(semanticFilters: AssetSemanticFilters = {}) {
    const loadAssetPage = useCallback(
        ({ currentPage, debouncedSearch, filters, limit }: RegisterPageLoadRequest<AssetRegisterFilters, 'all'>) =>
            assetApi.getAssets({
                ...buildAssetListParams({
                    currentPage,
                    debouncedSearch,
                    includeArchived: filters.statusFilter !== 'active',
                    limit,
                    sortDirection: filters.sortDirection,
                    sortField: filters.sortField,
                }),
                ...semanticFilters,
            }),
        [semanticFilters],
    );

    const toUiErrorKey = useCallback((error: unknown) => apiClient.toUiMessageKey(error), []);

    const registerController = useRegisterPageController<Asset, AssetRegisterFilters, 'all'>({
        clearOnNonForbidden: true,
        fallbackErrorKey: 'errors.load_failed',
        getGroupBy: () => null,
        initialFilters: {
            sortDirection: null,
            sortField: null,
            statusFilter: 'active',
        },
        initialViewMode: 'all',
        loadPage: loadAssetPage,
        submitExport: () => Promise.resolve(),
        toErrorKey: toUiErrorKey,
    });
    const { fetchCollection: fetchAssets, setErrorKey, updateFilter, updateFilters } = registerController;

    const restoreAsset = useCallback(
        async (assetId: number) => {
            try {
                await assetApi.restoreAsset(assetId);
                await fetchAssets();
            } catch (error) {
                setErrorKey(apiClient.toUiMessageKey(error));
            }
        },
        [fetchAssets, setErrorKey],
    );

    const updateStatusFilter = useCallback(
        (value: AssetArchiveFilter) => {
            updateFilter('statusFilter', value);
        },
        [updateFilter],
    );

    const updateSort = useCallback(
        (sortField: AssetSortField | null, sortDirection: SortDirection) => {
            updateFilters({ sortDirection, sortField });
        },
        [updateFilters],
    );

    return {
        capabilities: registerController.capabilities,
        currentPage: registerController.currentPage,
        errorKey: registerController.errorKey,
        fetchAssets,
        hasLoadedOnce: registerController.hasLoadedOnce,
        isAccessDenied: registerController.isAccessDenied,
        isLoading: registerController.isLoading,
        items: registerController.items,
        limit: registerController.limit,
        restoreAsset,
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
