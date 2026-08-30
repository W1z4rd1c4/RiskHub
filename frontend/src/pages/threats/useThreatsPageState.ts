import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SortDirection } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { SupportedLanguage } from '@/i18n';
import { apiClient } from '@/services/apiClient';
import { threatApi } from '@/services/threatApi';
import type { ThreatFacets, ThreatListCapabilities, ThreatListItem, ThreatSortField } from '@/types/threat';

import {
    getTotalPages,
    useCollectionDataState,
    useLatestRequestGuard,
} from '../shared/collectionPageState';
import {
    buildRegisterUrlParams,
    normalizeRegisterUrlParams,
    parseRegisterUrlState,
    type RegisterSortState,
} from '../shared/registerListQuery';
import {
    buildThreatRegisterListParams,
    parseThreatRegisterFilters,
    serializeThreatRegisterFilters,
    THREAT_REGISTER_CONFIG,
    type ThreatLifecycleFilter,
    type ThreatRegisterFilters,
    type ThreatRegisterView,
} from './threatRegisterConfig';

const THREAT_VIEWS = THREAT_REGISTER_CONFIG.views.map(({ value }) => value);
const THREAT_SORT_FIELDS: readonly ThreatSortField[] = [
    'name',
    'category',
    'threat_steward',
    'relevant_subject',
    'linked_risk_count',
    'created_at',
];

const validSort = (sort: RegisterSortState | null) => (
    sort && THREAT_SORT_FIELDS.includes(sort.field as ThreatSortField) ? sort : null
);
const selectedGroupLabel = (groups: Array<{ value: string; label: string }>, value: string | null) => (
    value ? groups.find((group) => group.value === value)?.label ?? null : null
);

export function useThreatsPageState(language: SupportedLanguage = 'en') {
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedParams = searchParams.toString();
    const urlState = useMemo(() => parseRegisterUrlState(new URLSearchParams(serializedParams), {
        defaultView: 'all',
        allowedViews: THREAT_VIEWS,
    }), [serializedParams]);
    const filters = useMemo(() => parseThreatRegisterFilters(urlState.filters), [urlState.filters]);
    const viewMode = urlState.view as ThreatRegisterView;
    const sort = validSort(urlState.sort);
    const groupValue = urlState.selectedGroupValue;
    const debouncedSearch = useDebouncedValue(urlState.search, 300);
    const currentPage = urlState.page;
    const [facets, setFacets] = useState<ThreatFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure,
        applySuccess,
        beginQuery,
        commitQueryIdentity,
        forQuery,
        isLoading: collectionIsLoading,
        isQueryCurrent,
        setErrorKey,
        setIsLoading,
    } = useCollectionDataState<ThreatListItem, ThreatListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();

    const listParams = useMemo(() => buildThreatRegisterListParams({
        currentPage,
        filters,
        groupValue,
        limit: DEFAULT_LIST_PAGE_SIZE,
        search: debouncedSearch,
        sort,
        view: viewMode,
    }), [currentPage, debouncedSearch, filters, groupValue, sort, viewMode]);
    const queryIdentity = JSON.stringify(listParams);
    useLayoutEffect(() => commitQueryIdentity(queryIdentity), [commitQueryIdentity, queryIdentity]);
    const queryState = forQuery(queryIdentity);
    const { capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied, items, totalCount } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const visibleFacets = queryState.isCurrentQuery ? facets : {};

    const fetchThreats = useCallback(async () => {
        const currentRequest = beginRequest();
        if (!beginQuery(queryIdentity)) setFacets({});
        setIsLoading(true);
        try {
            const response = await threatApi.getThreats(listParams);
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

    useEffect(() => {
        const params = new URLSearchParams(serializedParams);
        if (!normalizeRegisterUrlParams(params, {
            allowedSortFields: THREAT_SORT_FIELDS,
            allowedViews: THREAT_VIEWS,
            canonicalizeFilters: (rawFilters) => serializeThreatRegisterFilters(parseThreatRegisterFilters(rawFilters)),
            defaultView: 'all',
        })) return;
        setSearchParams(params, { replace: true });
    }, [serializedParams, setSearchParams]);
    useEffect(() => { void fetchThreats(); }, [fetchThreats]);

    const writeUrl = useCallback((next: {
        filters?: ThreatRegisterFilters;
        group?: string | null;
        search?: string;
        sort?: RegisterSortState | null;
        view?: ThreatRegisterView;
    }, replace = false) => {
        const params = buildRegisterUrlParams({
            filters: serializeThreatRegisterFilters(next.filters ?? filters),
            page: 1,
            search: next.search ?? urlState.search,
            selectedGroupValue: next.group === undefined ? groupValue : next.group,
            sort: next.sort === undefined ? sort : next.sort,
            view: next.view ?? viewMode,
        }, new URLSearchParams(serializedParams));
        setSearchParams(params, { replace });
    }, [filters, groupValue, serializedParams, setSearchParams, sort, urlState.search, viewMode]);

    const setCurrentPage = useCallback((page: number) => {
        const params = new URLSearchParams(serializedParams);
        if (page > 1) params.set('page', String(page));
        else params.delete('page');
        setSearchParams(params);
    }, [serializedParams, setSearchParams]);

    const updateFilter = useCallback(<K extends keyof ThreatRegisterFilters>(
        key: K,
        value: ThreatRegisterFilters[K],
    ) => writeUrl({ filters: { ...filters, [key]: value }, group: null }), [filters, writeUrl]);

    const restoreThreat = useCallback(async (threatId: number) => {
        const restoreQueryIdentity = queryIdentity;
        try {
            await threatApi.restoreThreat(threatId);
            if (isQueryCurrent(restoreQueryIdentity)) await fetchThreats();
        } catch (error) {
            if (isQueryCurrent(restoreQueryIdentity)) setErrorKey(apiClient.toUiMessageKey(error));
        }
    }, [fetchThreats, isQueryCurrent, queryIdentity, setErrorKey]);

    const exportThreats = useCallback(async () => {
        setIsExporting(true);
        try {
            await threatApi.downloadExport({
                ...listParams,
                offset: 0,
                limit: DEFAULT_LIST_PAGE_SIZE,
                search: urlState.search.trim() || undefined,
            }, language);
        } finally {
            setIsExporting(false);
        }
    }, [language, listParams, urlState.search]);

    return {
        capabilities,
        clearFilters: () => writeUrl({ filters: parseThreatRegisterFilters({}), group: null }),
        clearSelectedGroup: () => writeUrl({ group: null }),
        currentPage,
        errorKey,
        exportThreats,
        facets: visibleFacets,
        fetchThreats,
        filters,
        groups,
        hasLoadedOnce,
        isAccessDenied,
        isExporting,
        isLoading,
        items,
        limit: DEFAULT_LIST_PAGE_SIZE,
        restoreThreat,
        search: urlState.search,
        selectGroup: (value: string, _label?: string) => writeUrl({ group: value }),
        selectedGroupLabel: selectedGroupLabel(groups, groupValue),
        selectedGroupValue: groupValue,
        setCurrentPage,
        sortDirection: sort?.direction ?? null,
        sortField: (sort?.field as ThreatSortField | undefined) ?? null,
        statusFilter: filters.lifecycle,
        totalCount,
        totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE),
        updateFilter,
        updateSearch: (value: string) => writeUrl({ search: value, group: null }, true),
        updateSort: (field: ThreatSortField | null, direction: SortDirection) => (
            writeUrl({ sort: field && direction ? { field, direction } : null })
        ),
        updateStatusFilter: (value: ThreatLifecycleFilter) => updateFilter('lifecycle', value),
        updateViewMode: (view: ThreatRegisterView) => writeUrl({ view, group: null }),
        viewMode,
    };
}
