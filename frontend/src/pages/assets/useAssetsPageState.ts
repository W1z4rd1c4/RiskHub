import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SortDirection } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { SupportedLanguage } from '@/i18n';
import { apiClient } from '@/services/apiClient';
import { assetApi } from '@/services/assetApi';
import type { Asset, AssetFacets, AssetListCapabilities, AssetSortField } from '@/types/asset';

import {
    canonicalAssetCriticality,
    type AssetSemanticFilters,
} from '../shared/ictRegisterSemanticFilters';
import {
    getTotalPages,
    useCollectionDataState,
    useLatestRequestGuard,
} from '../shared/collectionPageState';
import { buildRegisterUrlParams, parseRegisterUrlState, type RegisterSortState } from '../shared/registerListQuery';
import {
    ASSET_REGISTER_CONFIG,
    buildAssetRegisterListParams,
    parseAssetRegisterFilters,
    serializeAssetRegisterFilters,
    type AssetLifecycleFilter,
    type AssetRegisterFilters,
    type AssetRegisterView,
} from './assetRegisterConfig';

const ASSET_VIEWS = ASSET_REGISTER_CONFIG.views.map(({ value }) => value);
const ASSET_SORT_FIELDS: readonly AssetSortField[] = [
    'name', 'asset_type', 'asset_level', 'business_owner', 'ict_owner', 'department',
    'criticality', 'cif', 'lifecycle_state', 'created_at',
];
const validSort = (sort: RegisterSortState | null) => sort && ASSET_SORT_FIELDS.includes(sort.field as AssetSortField) ? sort : null;
const selectedGroupLabel = (groups: Array<{ value: string; label: string }>, value: string | null) =>
    value ? groups.find((group) => group.value === value)?.label ?? null : null;

export function useAssetsPageState(semanticFilters: AssetSemanticFilters = {}, language: SupportedLanguage = 'en') {
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedParams = searchParams.toString();
    const urlState = useMemo(() => parseRegisterUrlState(new URLSearchParams(serializedParams), {
        defaultView: 'all', allowedViews: ASSET_VIEWS,
    }), [serializedParams]);
    const filters = useMemo(() => parseAssetRegisterFilters(urlState.filters), [urlState.filters]);
    const viewMode = urlState.view as AssetRegisterView;
    const sort = validSort(urlState.sort);
    const groupValue = urlState.selectedGroupValue;
    const debouncedSearch = useDebouncedValue(urlState.search, 300);
    const [currentPage, setCurrentPage] = useState(1);
    const [facets, setFacets] = useState<AssetFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure,
        applySuccess,
        capabilities,
        errorKey,
        groups,
        hasLoadedOnce,
        isAccessDenied,
        isLoading,
        items,
        setErrorKey,
        setIsLoading,
        totalCount,
    } = useCollectionDataState<Asset, AssetListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();

    const effectiveFilters = useMemo<AssetRegisterFilters>(() => ({
        ...filters,
        criticality: semanticFilters.criticality
            ? [canonicalAssetCriticality(semanticFilters.criticality) ?? semanticFilters.criticality]
            : filters.criticality,
    }), [filters, semanticFilters.criticality]);
    const listParams = useMemo(() => ({
        ...buildAssetRegisterListParams({ currentPage, filters: effectiveFilters, groupValue, limit: DEFAULT_LIST_PAGE_SIZE, search: debouncedSearch, sort, view: viewMode }),
        has_process_link: semanticFilters.has_process_link,
    }), [currentPage, debouncedSearch, effectiveFilters, groupValue, semanticFilters.has_process_link, sort, viewMode]);

    const fetchAssets = useCallback(async () => {
        const currentRequest = beginRequest();
        setIsLoading(true);
        try {
            const response = await assetApi.getAssets(listParams);
            if (!isCurrentRequest(currentRequest)) return;
            applySuccess({
                items: response.items,
                groups: response.groups ?? [],
                capabilities: response.capabilities ?? null,
                total: response.total,
            });
            setFacets(response.facets ?? {});
        } catch (error) {
            if (!isCurrentRequest(currentRequest)) return;
            const patch = applyFailure(error, { toErrorKey: apiClient.toUiMessageKey.bind(apiClient) });
            if (patch.isAccessDenied) setFacets({});
        } finally {
            if (isCurrentRequest(currentRequest)) setIsLoading(false);
        }
    }, [applyFailure, applySuccess, beginRequest, isCurrentRequest, listParams, setIsLoading]);

    useEffect(() => setCurrentPage(1), [serializedParams]);
    useEffect(() => { void fetchAssets(); }, [fetchAssets]);

    const writeUrl = useCallback((next: {
        filters?: AssetRegisterFilters; group?: string | null; search?: string; sort?: RegisterSortState | null; view?: AssetRegisterView;
    }, replace = false) => {
        const params = buildRegisterUrlParams({
            filters: serializeAssetRegisterFilters(next.filters ?? filters), search: next.search ?? urlState.search,
            selectedGroupValue: next.group === undefined ? groupValue : next.group,
            sort: next.sort === undefined ? sort : next.sort, view: next.view ?? viewMode,
        }, new URLSearchParams(serializedParams));
        setSearchParams(params, { replace }); setCurrentPage(1);
    }, [filters, groupValue, serializedParams, setSearchParams, sort, urlState.search, viewMode]);

    const updateFilter = useCallback(<K extends keyof AssetRegisterFilters>(key: K, value: AssetRegisterFilters[K]) =>
        writeUrl({ filters: { ...filters, [key]: value }, group: null }), [filters, writeUrl]);
    const restoreAsset = useCallback(async (assetId: number) => {
        try { await assetApi.restoreAsset(assetId); await fetchAssets(); }
        catch (error) { setErrorKey(apiClient.toUiMessageKey(error)); }
    }, [fetchAssets, setErrorKey]);
    const exportAssets = useCallback(async () => {
        setIsExporting(true);
        try { await assetApi.downloadExport({ ...listParams, offset: 0, limit: DEFAULT_LIST_PAGE_SIZE, search: urlState.search.trim() || undefined }, language); }
        catch (error) { setErrorKey(apiClient.toUiMessageKey(error)); }
        finally { setIsExporting(false); }
    }, [language, listParams, setErrorKey, urlState.search]);

    return {
        capabilities, clearFilters: () => writeUrl({ filters: parseAssetRegisterFilters({}), group: null }),
        clearSelectedGroup: () => writeUrl({ group: null }), currentPage, errorKey, exportAssets, facets, fetchAssets,
        filters, groups, hasLoadedOnce, isAccessDenied,
        isExporting, isLoading, items, limit: DEFAULT_LIST_PAGE_SIZE,
        restoreAsset, search: urlState.search, selectGroup: (value: string, _label?: string) => writeUrl({ group: value }),
        selectedGroupLabel: selectedGroupLabel(groups, groupValue), selectedGroupValue: groupValue, setCurrentPage,
        sortDirection: sort?.direction ?? null, sortField: (sort?.field as AssetSortField | undefined) ?? null,
        statusFilter: filters.lifecycle, totalCount,
        totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE),
        updateFilter, updateSearch: (value: string) => writeUrl({ search: value, group: null }, true),
        updateSort: (field: AssetSortField | null, direction: SortDirection) => writeUrl({ sort: field && direction ? { field, direction } : null }),
        updateStatusFilter: (value: AssetLifecycleFilter) => updateFilter('lifecycle', value),
        updateViewMode: (view: AssetRegisterView) => writeUrl({ view, group: null }), viewMode,
    };
}
