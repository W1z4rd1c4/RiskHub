import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import type { SupportedLanguage } from '@/i18n';
import { apiClient } from '@/services/apiClient';
import { assetApi } from '@/services/assetApi';
import type { Asset, AssetFacets, AssetListCapabilities, AssetSortField } from '@/types/asset';

import { useDepartmentRegisterScope } from '../departments/useDepartmentRegisterScope';
import {
    canonicalAssetCriticality,
    type AssetSemanticFilters,
} from '../shared/ictRegisterSemanticFilters';
import {
    getTotalPages,
    useCollectionDataState,
    useLatestRequestGuard,
} from '../shared/collectionPageState';
import { useStableRegisterRequestParams } from '../shared/useStableRegisterRequestParams';
import { useCommittedRegisterQuery, useRegisterUrlWorkingSet } from '../shared/useRegisterUrlWorkingSet';
import { useRestoreWithFeedback } from '../shared/useRestoreWithFeedback';
import {
    ASSET_REGISTER_CONFIG,
    buildAssetRegisterListParams,
    parseAssetRegisterFilters,
    serializeAssetRegisterFilters,
    type AssetRegisterFilters,
} from './assetRegisterConfig';

const ASSET_VIEWS = ASSET_REGISTER_CONFIG.views.map(({ value }) => value);
const ASSET_SORT_FIELDS: readonly AssetSortField[] = [
    'name', 'asset_type', 'asset_level', 'business_owner', 'ict_owner', 'department',
    'criticality', 'cif', 'lifecycle_state', 'created_at',
];
const selectedGroupLabel = (groups: Array<{ value: string; label: string }>, value: string | null) =>
    value ? groups.find((group) => group.value === value)?.label ?? null : null;

const assetUrlOptions = {
    allowedViews: ASSET_VIEWS,
    allowedSortFields: ASSET_SORT_FIELDS,
    parseFilters: parseAssetRegisterFilters,
    serializeFilters: serializeAssetRegisterFilters,
};

export function useAssetsPageState(semanticFilters: AssetSemanticFilters = {}, language: SupportedLanguage = 'en') {
    const departmentScope = useDepartmentRegisterScope();
    const workingSet = useRegisterUrlWorkingSet(assetUrlOptions);
    const { currentPage, debouncedSearch, filters, selectedGroupValue: groupValue, sort, viewMode, writeUrl } = workingSet;
    const [facets, setFacets] = useState<AssetFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure,
        applySuccess,
        beginQuery,
        commitQueryIdentity,
        forQuery,
        isLoading: collectionIsLoading,
        isQueryCurrent,
        setIsLoading,
    } = useCollectionDataState<Asset, AssetListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();

    const effectiveFilters = useMemo<AssetRegisterFilters>(() => ({
        ...filters,
        department_ids: departmentScope ? [departmentScope.departmentId] : filters.department_ids,
        lifecycle: semanticFilters.committee_scope === true ? 'all' : filters.lifecycle,
        criticality: semanticFilters.criticality
            ? [canonicalAssetCriticality(semanticFilters.criticality) ?? semanticFilters.criticality]
            : filters.criticality,
    }), [departmentScope, filters, semanticFilters.committee_scope, semanticFilters.criticality]);
    const requestParams = useMemo(() => ({
        ...buildAssetRegisterListParams({ currentPage, filters: effectiveFilters, groupValue, limit: DEFAULT_LIST_PAGE_SIZE, search: debouncedSearch, sort, view: viewMode }),
        has_process_link: semanticFilters.has_process_link,
    }), [currentPage, debouncedSearch, effectiveFilters, groupValue, semanticFilters.has_process_link, sort, viewMode]);
    const listParams = useStableRegisterRequestParams(requestParams);
    const { queryIdentity, getExportParams } = useCommittedRegisterQuery(listParams, commitQueryIdentity);
    const runRowRestore = useRestoreWithFeedback(queryIdentity);
    const queryState = forQuery(queryIdentity);
    const { capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied, items, totalCount } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const visibleFacets = queryState.isCurrentQuery ? facets : {};

    const fetchAssets = useCallback(async () => {
        const currentRequest = beginRequest();
        if (!beginQuery(queryIdentity)) setFacets({});
        setIsLoading(true);
        try {
            const response = await assetApi.getAssets(listParams);
            if (!isCurrentRequest(currentRequest)) return;
            applySuccess(queryIdentity, {
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
    }, [applyFailure, applySuccess, beginQuery, beginRequest, isCurrentRequest, listParams, queryIdentity, setIsLoading]);

    useEffect(() => { void fetchAssets(); }, [fetchAssets]);

    const updateFilter = useCallback(<K extends keyof AssetRegisterFilters>(key: K, value: AssetRegisterFilters[K]) =>
        writeUrl({ filters: { ...filters, [key]: value }, group: null }), [filters, writeUrl]);
    // D9 / FB-01: a row restore reports through a toast and never flips the
    // register into its error state.
    const restoreAsset = useCallback(async (assetId: number) => {
        const restoreQueryIdentity = queryIdentity;
        await runRowRestore({
            restore: () => assetApi.restoreAsset(assetId),
            name: items.find((item) => item.id === assetId)?.name,
            refresh: async () => {
                if (isQueryCurrent(restoreQueryIdentity)) await fetchAssets();
            },
        });
    }, [fetchAssets, isQueryCurrent, items, queryIdentity, runRowRestore]);
    const exportAssets = useCallback(async () => {
        setIsExporting(true);
        try { await assetApi.downloadExport(getExportParams(), language); }
        finally { setIsExporting(false); }
    }, [getExportParams, language]);

    return {
        workingSet,
        capabilities, errorKey, facets: visibleFacets, groups, hasLoadedOnce, isAccessDenied,
        isExporting, isLoading, items, limit: DEFAULT_LIST_PAGE_SIZE,
        totalCount, totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE), updateFilter,
        selectedGroupLabel: selectedGroupLabel(groups, groupValue),
        exportAssets, fetchAssets, restoreAsset,
        clearFilters: () => writeUrl({ filters: parseAssetRegisterFilters({}), group: null }),
    };
}
