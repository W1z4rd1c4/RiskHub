import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SortDirection } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { type SupportedLanguage } from '@/i18n';
import { apiClient, isForbiddenApiError } from '@/services/apiClient';
import { processApi } from '@/services/processApi';
import type {
    Process,
    ProcessFacets,
    ProcessListCapabilities,
    ProcessSortField,
} from '@/types/process';

import type { ProcessSemanticFilters } from '../shared/ictRegisterSemanticFilters';
import {
    buildRegisterUrlParams,
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
    const [currentPage, setCurrentPage] = useState(1);
    const [items, setItems] = useState<Process[]>([]);
    const [groups, setGroups] = useState<Array<{ value: string; label: string; count: number; active_count?: number | null; highlighted_count?: number | null; meta?: Record<string, unknown> }>>([]);
    const [facets, setFacets] = useState<ProcessFacets>({});
    const [capabilities, setCapabilities] = useState<ProcessListCapabilities | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const requestId = useRef(0);

    const effectiveFilters = useMemo<ProcessRegisterFilters>(() => ({
        ...filters,
        cif: semanticFilters.cif === true ? true : filters.cif,
    }), [filters, semanticFilters.cif]);

    const listParams = useMemo(() => buildProcessRegisterListParams({
        currentPage,
        filters: effectiveFilters,
        groupValue: selectedGroupValue,
        limit: DEFAULT_LIST_PAGE_SIZE,
        search: debouncedSearch,
        sort,
        view: viewMode,
    }), [currentPage, debouncedSearch, effectiveFilters, selectedGroupValue, sort, viewMode]);

    const fetchProcesses = useCallback(async () => {
        const currentRequest = ++requestId.current;
        setIsLoading(true);
        try {
            const response = await processApi.getProcesses(listParams);
            if (currentRequest !== requestId.current) return;
            setItems(response.items);
            setGroups(response.groups ?? []);
            setFacets(response.facets ?? {});
            setCapabilities(response.capabilities ?? null);
            setTotalCount(response.total);
            setHasLoadedOnce(true);
            setIsAccessDenied(false);
            setErrorKey(null);
        } catch (error) {
            if (currentRequest !== requestId.current) return;
            if (isForbiddenApiError(error)) {
                setItems([]);
                setGroups([]);
                setFacets({});
                setCapabilities(null);
                setTotalCount(0);
                setHasLoadedOnce(false);
                setIsAccessDenied(true);
                setErrorKey(null);
            } else {
                setErrorKey(apiClient.toUiMessageKey(error));
            }
        } finally {
            if (currentRequest === requestId.current) setIsLoading(false);
        }
    }, [listParams]);

    useEffect(() => {
        setCurrentPage(1);
    }, [serializedParams]);

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
            search: next.search ?? urlState.search,
            selectedGroupValue: next.group === undefined ? selectedGroupValue : next.group,
            sort: next.sort === undefined ? sort : next.sort,
            view: next.view ?? viewMode,
        }, new URLSearchParams(serializedParams));
        setSearchParams(params, { replace });
        setCurrentPage(1);
    }, [filters, selectedGroupValue, serializedParams, setSearchParams, sort, urlState.search, viewMode]);

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
        try {
            await processApi.restoreProcess(processId);
            await fetchProcesses();
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        }
    }, [fetchProcesses]);

    const exportProcesses = useCallback(async () => {
        setIsExporting(true);
        try {
            await processApi.downloadExport({
                ...listParams,
                offset: 0,
                limit: DEFAULT_LIST_PAGE_SIZE,
                search: urlState.search.trim() || undefined,
            }, language);
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
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
        facets,
        fetchProcesses,
        filters,
        groups,
        hasLoadedOnce,
        isAccessDenied,
        isExporting,
        isLoading,
        items,
        limit: DEFAULT_LIST_PAGE_SIZE,
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
        totalPages: Math.ceil(totalCount / DEFAULT_LIST_PAGE_SIZE) || 1,
        updateFilter,
        updateProcessFilter: <K extends ProcessFilterKey>(key: K, value: ProcessRegisterFilters[K]) => updateFilter(key, value),
        updateSearch,
        updateSort,
        updateStatusFilter: (value: ProcessLifecycleFilter) => updateFilter('lifecycle', value),
        updateViewMode,
        viewMode,
    };
}
