import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SortDirection } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { type SupportedLanguage } from '@/i18n';
import { apiClient } from '@/services/apiClient';
import { processApi } from '@/services/processApi';
import type {
    Process,
    ProcessFacets,
    ProcessListCapabilities,
    ProcessPendingCreationRead,
    ProcessSortField,
} from '@/types/process';

import { useDepartmentRegisterScope } from '../departments/useDepartmentRegisterScope';
import type { ProcessSemanticFilters } from '../shared/ictRegisterSemanticFilters';
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
    buildProcessRegisterListParams,
    parseProcessRegisterFilters,
    PROCESS_REGISTER_CONFIG,
    serializeProcessRegisterFilters,
    type ProcessFilterKey,
    type ProcessLifecycleFilter,
    type ProcessRegisterFilters,
    type ProcessRegisterView,
} from './processRegisterConfig';

const PROCESS_VIEWS = PROCESS_REGISTER_CONFIG.views.map(({ value }) => value);
const PROCESS_SORT_FIELDS: readonly ProcessSortField[] = ['f_code', 'l0_area', 'l1_process', 'owner', 'created_at'];

function validSort(sort: RegisterSortState | null): RegisterSortState | null {
    return sort && PROCESS_SORT_FIELDS.includes(sort.field as ProcessSortField) ? sort : null;
}

function labelsForSelectedGroup(groups: Array<{ value: string; label: string }>, value: string | null) {
    if (!value) return null;
    return groups.find((group) => group.value === value)?.label ?? null;
}

export function useProcessesPageState(
    semanticFilters: ProcessSemanticFilters = {},
    language: SupportedLanguage = 'en',
) {
    const departmentScope = useDepartmentRegisterScope();
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedParams = searchParams.toString();
    const urlState = useMemo(() => parseRegisterUrlState(
        new URLSearchParams(serializedParams),
        { defaultView: 'all', allowedViews: PROCESS_VIEWS },
    ), [serializedParams]);
    const filters = useMemo(() => parseProcessRegisterFilters(urlState.filters), [urlState.filters]);
    const viewMode = urlState.view as ProcessRegisterView;
    const sort = validSort(urlState.sort);
    const selectedGroupValue = urlState.selectedGroupValue;
    const debouncedSearch = useDebouncedValue(urlState.search, 300);
    const currentPage = urlState.page;
    const [facets, setFacets] = useState<ProcessFacets>({});
    const [pendingCreations, setPendingCreations] = useState<ProcessPendingCreationRead[]>([]);
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
    } = useCollectionDataState<Process, ProcessListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();

    const effectiveFilters = useMemo<ProcessRegisterFilters>(() => ({
        ...filters,
        department_ids: departmentScope ? [departmentScope.departmentId] : filters.department_ids,
        cif: semanticFilters.cif === true ? true : filters.cif,
    }), [departmentScope, filters, semanticFilters.cif]);

    const listParams = useMemo(() => buildProcessRegisterListParams({
        currentPage,
        filters: effectiveFilters,
        groupValue: selectedGroupValue,
        limit: DEFAULT_LIST_PAGE_SIZE,
        search: debouncedSearch,
        sort,
        view: viewMode,
    }), [currentPage, debouncedSearch, effectiveFilters, selectedGroupValue, sort, viewMode]);
    const queryIdentity = JSON.stringify(listParams);
    useLayoutEffect(() => commitQueryIdentity(queryIdentity), [commitQueryIdentity, queryIdentity]);
    const queryState = forQuery(queryIdentity);
    const { capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied, items, totalCount } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const visibleFacets = queryState.isCurrentQuery ? facets : {};
    const visiblePendingCreations = queryState.isCurrentQuery ? pendingCreations : [];

    const fetchProcesses = useCallback(async () => {
        const currentRequest = beginRequest();
        if (!beginQuery(queryIdentity)) {
            setFacets({});
            setPendingCreations([]);
        }
        setIsLoading(true);
        try {
            const response = await processApi.getProcesses(listParams);
            if (!isCurrentRequest(currentRequest)) return;
            applySuccess(queryIdentity, {
                items: response.items,
                groups: response.groups ?? [],
                capabilities: response.capabilities ?? null,
                total: response.total,
            });
            setFacets(response.facets ?? {});
            setPendingCreations(response.pending_creations);
        } catch (error) {
            if (!isCurrentRequest(currentRequest)) return;
            const patch = applyFailure(error, { toErrorKey: apiClient.toUiMessageKey.bind(apiClient) });
            if (patch.isAccessDenied) {
                setFacets({});
                setPendingCreations([]);
            }
        } finally {
            if (isCurrentRequest(currentRequest)) setIsLoading(false);
        }
    }, [applyFailure, applySuccess, beginQuery, beginRequest, isCurrentRequest, listParams, queryIdentity, setIsLoading]);

    useEffect(() => {
        const params = new URLSearchParams(serializedParams);
        if (!normalizeRegisterUrlParams(params, {
            allowedSortFields: PROCESS_SORT_FIELDS,
            allowedViews: PROCESS_VIEWS,
            canonicalizeFilters: (rawFilters) => serializeProcessRegisterFilters(parseProcessRegisterFilters(rawFilters)),
            defaultView: 'all',
        })) return;
        setSearchParams(params, { replace: true });
    }, [serializedParams, setSearchParams]);

    useEffect(() => {
        void fetchProcesses();
    }, [fetchProcesses]);

    const writeUrl = useCallback((next: {
        filters?: ProcessRegisterFilters;
        group?: string | null;
        search?: string;
        sort?: RegisterSortState | null;
        view?: ProcessRegisterView;
    }, replace = false) => {
        const params = buildRegisterUrlParams({
            filters: serializeProcessRegisterFilters(next.filters ?? filters),
            page: 1,
            search: next.search ?? urlState.search,
            selectedGroupValue: next.group === undefined ? selectedGroupValue : next.group,
            sort: next.sort === undefined ? sort : next.sort,
            view: next.view ?? viewMode,
        }, new URLSearchParams(serializedParams));
        setSearchParams(params, { replace });
    }, [filters, selectedGroupValue, serializedParams, setSearchParams, sort, urlState.search, viewMode]);

    const setCurrentPage = useCallback((page: number) => {
        const params = new URLSearchParams(serializedParams);
        if (page > 1) params.set('page', String(page));
        else params.delete('page');
        setSearchParams(params);
    }, [serializedParams, setSearchParams]);

    const updateSearch = useCallback((value: string) => writeUrl({ search: value, group: null }, true), [writeUrl]);
    const updateFilter = useCallback(<K extends keyof ProcessRegisterFilters>(key: K, value: ProcessRegisterFilters[K]) => {
        writeUrl({ filters: { ...filters, [key]: value }, group: null });
    }, [filters, writeUrl]);
    const clearFilters = useCallback(() => writeUrl({
        filters: parseProcessRegisterFilters({}),
        group: null,
    }), [writeUrl]);
    const updateViewMode = useCallback((view: ProcessRegisterView) => writeUrl({ view, group: null }), [writeUrl]);
    const selectGroup = useCallback((value: string) => writeUrl({ group: value }), [writeUrl]);
    const clearSelectedGroup = useCallback(() => writeUrl({ group: null }), [writeUrl]);
    const updateSort = useCallback((field: ProcessSortField | null, direction: SortDirection) => {
        writeUrl({ sort: field && direction ? { field, direction } : null });
    }, [writeUrl]);

    const restoreProcess = useCallback(async (processId: number) => {
        const restoreQueryIdentity = queryIdentity;
        try {
            await processApi.restoreProcess(processId);
            if (isQueryCurrent(restoreQueryIdentity)) await fetchProcesses();
        } catch (error) {
            if (isQueryCurrent(restoreQueryIdentity)) setErrorKey(apiClient.toUiMessageKey(error));
        }
    }, [fetchProcesses, isQueryCurrent, queryIdentity, setErrorKey]);

    const exportProcesses = useCallback(async () => {
        setIsExporting(true);
        try {
            await processApi.downloadExport({
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
        clearFilters,
        clearSelectedGroup,
        currentPage,
        errorKey,
        exportProcesses,
        facets: visibleFacets,
        fetchProcesses,
        filters,
        groups,
        hasLoadedOnce,
        isAccessDenied,
        isExporting,
        isLoading,
        items,
        limit: DEFAULT_LIST_PAGE_SIZE,
        pendingCreations: visiblePendingCreations,
        restoreProcess,
        search: urlState.search,
        selectGroup: (value: string, _label?: string) => selectGroup(value),
        selectedGroupLabel: labelsForSelectedGroup(groups, selectedGroupValue),
        selectedGroupValue,
        setCurrentPage,
        sortDirection: sort?.direction ?? null,
        sortField: (sort?.field as ProcessSortField | undefined) ?? null,
        statusFilter: filters.lifecycle,
        totalCount,
        totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE),
        updateFilter,
        updateProcessFilter: <K extends ProcessFilterKey>(key: K, value: ProcessRegisterFilters[K]) => updateFilter(key, value),
        updateSearch,
        updateSort,
        updateStatusFilter: (value: ProcessLifecycleFilter) => updateFilter('lifecycle', value),
        updateViewMode,
        viewMode,
    };
}
