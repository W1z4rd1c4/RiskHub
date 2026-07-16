import { useCallback, useEffect, useMemo, useState } from 'react';
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

import { getTotalPages, useCollectionDataState, useLatestRequestGuard } from '../shared/collectionPageState';
import { buildRegisterUrlParams, parseRegisterUrlState, type RegisterSortState } from '../shared/registerListQuery';
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
    const [currentPage, setCurrentPage] = useState(1);
    const [facets, setFacets] = useState<ControlFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure, applySuccess, capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied,
        isLoading, items, setErrorKey, setIsLoading, totalCount,
    } = useCollectionDataState<ControlSummary, ControlListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();
    const listParams = useMemo(() => buildControlRegisterListParams({
        currentPage, filters, groupValue: selectedGroupValue, limit: DEFAULT_LIST_PAGE_SIZE,
        search: debouncedSearch, sort, view: viewMode,
    }), [currentPage, debouncedSearch, filters, selectedGroupValue, sort, viewMode]);

    const fetchControls = useCallback(async () => {
        const request = beginRequest();
        setIsLoading(true);
        try {
            const response = await controlApi.getControls(listParams);
            if (!isCurrentRequest(request)) return;
            applySuccess({ items: response.items, groups: response.groups ?? [], capabilities: response.capabilities ?? null, total: response.total });
            setFacets(response.facets ?? {});
        } catch (error) {
            if (!isCurrentRequest(request)) return;
            const patch = applyFailure(error, { toErrorKey: apiClient.toUiMessageKey.bind(apiClient) });
            if (patch.isAccessDenied) setFacets({});
        } finally { if (isCurrentRequest(request)) setIsLoading(false); }
    }, [applyFailure, applySuccess, beginRequest, isCurrentRequest, listParams, setIsLoading]);

    useEffect(() => setCurrentPage(1), [serializedParams]);
    useEffect(() => { void fetchControls(); }, [fetchControls]);

    const writeUrl = useCallback((next: {
        filters?: ControlRegisterFilters; group?: string | null; search?: string;
        sort?: RegisterSortState | null; view?: ControlRegisterView;
    }, replace = false) => {
        const params = buildRegisterUrlParams({
            filters: serializeControlRegisterFilters(next.filters ?? filters), search: next.search ?? urlState.search,
            selectedGroupValue: next.group === undefined ? selectedGroupValue : next.group,
            sort: next.sort === undefined ? sort : next.sort, view: next.view ?? viewMode,
        }, new URLSearchParams(serializedParams));
        setSearchParams(params, { replace }); setCurrentPage(1);
    }, [filters, selectedGroupValue, serializedParams, setSearchParams, sort, urlState.search, viewMode]);
    const updateFilter = useCallback(<K extends keyof ControlRegisterFilters>(key: K, value: ControlRegisterFilters[K]) => {
        writeUrl({ filters: { ...filters, [key]: value }, group: null });
    }, [filters, writeUrl]);
    const clearFilters = useCallback(() => writeUrl({ filters: {
        lifecycle: 'active', monitoring_status: '', status: '', process: '', category: '',
    }, group: null }), [writeUrl]);
    const restoreControl = useCallback(async (controlId: number) => {
        try { await controlApi.restoreControl(controlId); await fetchControls(); }
        catch (error) { setErrorKey(apiClient.toUiMessageKey(error)); }
    }, [fetchControls, setErrorKey]);
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
    }, [debouncedSearch, filters]);

    return {
        capabilities, clearFilters, clearSelectedGroup: () => writeUrl({ group: null }), currentPage,
        errorKey, exportControlSnapshot, exportCurrentControls, facets, fetchControls, filters, groups, hasLoadedOnce, isAccessDenied,
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
