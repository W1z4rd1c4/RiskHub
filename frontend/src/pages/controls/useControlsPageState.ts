import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { SortDirection } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { SupportedLanguage } from '@/i18n';
import { apiClient } from '@/services/apiClient';
import { controlApi } from '@/services/controlApi';
import { reportApi } from '@/services/reportApi';
import type { ControlFacets, ControlListCapabilities, ControlSummary } from '@/types/control';

import { useDepartmentRegisterScope } from '../departments/useDepartmentRegisterScope';
import { getTotalPages, useCollectionDataState, useLatestRequestGuard } from '../shared/collectionPageState';
import { buildRegisterUrlParams, normalizeRegisterUrlParams, parseRegisterUrlState, type RegisterSortState } from '../shared/registerListQuery';
import {
    buildControlRegisterListParams,
    CONTROL_REGISTER_CONFIG,
    parseControlRegisterFilters,
    serializeControlRegisterFilters,
    type ControlLifecycleFilter,
    type ControlRegisterFilters,
    type ControlRegisterView,
} from './controlRegisterConfig';

const CONTROL_VIEWS = CONTROL_REGISTER_CONFIG.views.map(({ value }) => value);
const CONTROL_SORT_FIELDS = ['name', 'department', 'frequency', 'risk_level', 'status', 'control_form'] as const;
const validSort = (sort: RegisterSortState | null) => sort && CONTROL_SORT_FIELDS.includes(sort.field as typeof CONTROL_SORT_FIELDS[number]) ? sort : null;
const groupLabel = (groups: Array<{ value: string; label: string }>, value: string | null) => value ? groups.find((group) => group.value === value)?.label ?? null : null;

export function useControlsPageState(language: SupportedLanguage = 'en') {
    const departmentScope = useDepartmentRegisterScope();
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedParams = searchParams.toString();
    const urlState = useMemo(() => parseRegisterUrlState(new URLSearchParams(serializedParams), {
        defaultView: 'all', allowedViews: CONTROL_VIEWS,
    }), [serializedParams]);
    const filters = useMemo(() => parseControlRegisterFilters(urlState.filters), [urlState.filters]);
    const viewMode = urlState.view as ControlRegisterView;
    const sort = validSort(urlState.sort);
    const selectedGroupValue = urlState.selectedGroupValue;
    const debouncedSearch = useDebouncedValue(urlState.search, 300);
    const currentPage = urlState.page;
    const [facets, setFacets] = useState<ControlFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure, applySuccess, beginQuery, commitQueryIdentity, forQuery,
        isLoading: collectionIsLoading, isQueryCurrent,
        setErrorKey, setIsLoading,
    } = useCollectionDataState<ControlSummary, ControlListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();
    const listParams = useMemo(() => ({
        ...buildControlRegisterListParams({
            currentPage, filters, groupValue: selectedGroupValue, limit: DEFAULT_LIST_PAGE_SIZE,
            search: debouncedSearch, sort, view: viewMode,
        }),
        department_id: departmentScope?.departmentId,
    }), [currentPage, debouncedSearch, departmentScope?.departmentId, filters, selectedGroupValue, sort, viewMode]);
    const queryIdentity = JSON.stringify(listParams);
    useLayoutEffect(() => commitQueryIdentity(queryIdentity), [commitQueryIdentity, queryIdentity]);
    const queryState = forQuery(queryIdentity);
    const { capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied, items, totalCount } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const visibleFacets = queryState.isCurrentQuery ? facets : {};

    const fetchControls = useCallback(async () => {
        const request = beginRequest();
        if (!beginQuery(queryIdentity)) setFacets({});
        setIsLoading(true);
        try {
            const response = await controlApi.getControls(listParams);
            if (!isCurrentRequest(request)) return;
            applySuccess(queryIdentity, { items: response.items, groups: response.groups ?? [], capabilities: response.capabilities ?? null, total: response.total });
            setFacets(response.facets ?? {});
        } catch (error) {
            if (!isCurrentRequest(request)) return;
            const patch = applyFailure(error, { toErrorKey: apiClient.toUiMessageKey.bind(apiClient) });
            if (patch.isAccessDenied) setFacets({});
        } finally { if (isCurrentRequest(request)) setIsLoading(false); }
    }, [applyFailure, applySuccess, beginQuery, beginRequest, isCurrentRequest, listParams, queryIdentity, setIsLoading]);

    useEffect(() => {
        const params = new URLSearchParams(serializedParams);
        if (!normalizeRegisterUrlParams(params, {
            allowedSortFields: CONTROL_SORT_FIELDS,
            allowedViews: CONTROL_VIEWS,
            canonicalizeFilters: (rawFilters) => serializeControlRegisterFilters(parseControlRegisterFilters(rawFilters)),
            defaultView: 'all',
        })) return;
        setSearchParams(params, { replace: true });
    }, [serializedParams, setSearchParams]);
    useEffect(() => { void fetchControls(); }, [fetchControls]);

    const writeUrl = useCallback((next: {
        filters?: ControlRegisterFilters; group?: string | null; search?: string;
        sort?: RegisterSortState | null; view?: ControlRegisterView;
    }, replace = false) => {
        const params = buildRegisterUrlParams({
            filters: serializeControlRegisterFilters(next.filters ?? filters), page: 1, search: next.search ?? urlState.search,
            selectedGroupValue: next.group === undefined ? selectedGroupValue : next.group,
            sort: next.sort === undefined ? sort : next.sort, view: next.view ?? viewMode,
        }, new URLSearchParams(serializedParams));
        setSearchParams(params, { replace });
    }, [filters, selectedGroupValue, serializedParams, setSearchParams, sort, urlState.search, viewMode]);
    const setCurrentPage = useCallback((page: number) => {
        const params = new URLSearchParams(serializedParams);
        if (page > 1) params.set('page', String(page));
        else params.delete('page');
        setSearchParams(params);
    }, [serializedParams, setSearchParams]);
    const updateFilter = useCallback(<K extends keyof ControlRegisterFilters>(key: K, value: ControlRegisterFilters[K]) => {
        writeUrl({ filters: { ...filters, [key]: value }, group: null });
    }, [filters, writeUrl]);
    const clearFilters = useCallback(() => writeUrl({ filters: {
        lifecycle: 'active', monitoring_status: '', status: '', process: '', category: '',
    }, group: null }), [writeUrl]);
    const restoreControl = useCallback(async (controlId: number) => {
        const restoreQueryIdentity = queryIdentity;
        try {
            await controlApi.restoreControl(controlId);
            if (isQueryCurrent(restoreQueryIdentity)) await fetchControls();
        } catch (error) {
            if (isQueryCurrent(restoreQueryIdentity)) setErrorKey(apiClient.toUiMessageKey(error));
        }
    }, [fetchControls, isQueryCurrent, queryIdentity, setErrorKey]);
    const exportCurrentControls = useCallback(async () => {
        setIsExporting(true);
        try {
            await controlApi.downloadExport({ ...listParams, offset: 0 }, language);
        }
        finally { setIsExporting(false); }
    }, [language, listParams]);
    const exportControlSnapshot = useCallback(async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
        setIsExporting(true);
        try {
            await reportApi.exportControls({
                format,
                asOfDate,
                filters: {
                    departmentId: departmentScope?.departmentId,
                    status: filters.lifecycle === 'archived'
                        ? 'archived'
                        : filters.lifecycle === 'all'
                            ? null
                            : filters.status || null,
                    monitoringStatus: filters.monitoring_status || null,
                    search: debouncedSearch.trim() || null,
                },
            });
        }
        finally { setIsExporting(false); }
    }, [debouncedSearch, departmentScope?.departmentId, filters]);

    return {
        capabilities, clearFilters, clearSelectedGroup: () => writeUrl({ group: null }), currentPage,
        errorKey, exportControlSnapshot, exportCurrentControls, facets: visibleFacets, fetchControls, filters, groups, hasLoadedOnce, isAccessDenied,
        isExporting, isLoading, items, limit: DEFAULT_LIST_PAGE_SIZE, restoreControl, search: urlState.search,
        selectGroup: (value: string, _label?: string) => writeUrl({ group: value }),
        selectedGroupLabel: groupLabel(groups, selectedGroupValue), selectedGroupValue, setCurrentPage,
        sortDirection: sort?.direction ?? null, sortField: sort?.field ?? null,
        statusFilter: filters.monitoring_status || (filters.lifecycle === 'archived' ? 'archived' : ''),
        totalCount, totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE), updateFilter,
        updateSearch: (value: string) => writeUrl({ search: value, group: null }, true),
        updateSort: (field: string | null, direction: SortDirection) => writeUrl({ sort: field && direction ? { field, direction } : null }),
        updateStatusFilter: (value: ControlLifecycleFilter) => updateFilter('lifecycle', value),
        updateViewMode: (view: ControlRegisterView) => writeUrl({ view, group: null }), viewMode,
    };
}
