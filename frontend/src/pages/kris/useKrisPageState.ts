import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { SortDirection } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { SupportedLanguage } from '@/i18n';
import { apiClient } from '@/services/apiClient';
import { kriApi } from '@/services/kriApi';
import { reportApi } from '@/services/reportApi';
import type { KRIFacets, KRIListCapabilities, KeyRiskIndicator } from '@/types/kri';

import { useDepartmentRegisterScope } from '../departments/useDepartmentRegisterScope';
import { resetDepartmentScopedPage, useDepartmentScopedPagination } from '../departments/useDepartmentScopedPagination';
import { getTotalPages, useCollectionDataState, useLatestRequestGuard } from '../shared/collectionPageState';
import { buildRegisterUrlParams, parseRegisterUrlState, type RegisterSortState } from '../shared/registerListQuery';
import { buildKriExportFilters, readKriRouteFilters } from './kriPagePresentation';
import {
    buildKriRegisterListParams,
    EMPTY_KRI_REGISTER_FILTERS,
    KRI_REGISTER_CONFIG,
    parseKriRegisterFilters,
    serializeKriRegisterFilters,
    type KriRegisterFilters,
    type KriRegisterView,
} from './kriRegisterConfig';

const KRI_VIEWS = KRI_REGISTER_CONFIG.views.map(({ value }) => value);
const KRI_SORT_FIELDS = ['metric_name', 'current_value', 'monitoring_status', 'risk_process', 'risk_description'] as const;
const validSort = (sort: RegisterSortState | null) => sort && KRI_SORT_FIELDS.includes(sort.field as typeof KRI_SORT_FIELDS[number]) ? sort : null;
const groupLabel = (groups: Array<{ value: string; label: string }>, value: string | null) => value ? groups.find((group) => group.value === value)?.label ?? null : null;

function parseLegacyFilters(params: URLSearchParams): Partial<KriRegisterFilters> {
    const legacy = readKriRouteFilters(params, ['new', 'not_submitted', 'breach', 'warning', 'optimal'], ['due_soon']);
    return {
        lifecycle: legacy.statusFilter === 'archived' ? 'archived' : 'active',
        monitoring_status: legacy.statusFilter !== 'all' && legacy.statusFilter !== 'archived' ? legacy.statusFilter : '',
        timeliness_status: legacy.timelinessFilter ?? '',
    };
}

export function useKrisPageState(language: SupportedLanguage = 'en') {
    const departmentScope = useDepartmentRegisterScope();
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedParams = searchParams.toString();
    const urlState = useMemo(() => parseRegisterUrlState(new URLSearchParams(serializedParams), {
        defaultView: 'all', allowedViews: KRI_VIEWS,
    }), [serializedParams]);
    const filters = useMemo(() => {
        const parsed = parseKriRegisterFilters(urlState.filters);
        return Object.keys(urlState.filters).length > 0
            ? parsed
            : { ...EMPTY_KRI_REGISTER_FILTERS, ...parseLegacyFilters(new URLSearchParams(serializedParams)) };
    }, [serializedParams, urlState.filters]);
    const effectiveFilters = useMemo(() => ({
        ...filters,
        department_id: departmentScope?.departmentId ?? filters.department_id,
    }), [departmentScope?.departmentId, filters]);
    const viewMode = urlState.view as KriRegisterView;
    const sort = validSort(urlState.sort);
    const selectedGroupValue = urlState.selectedGroupValue;
    const debouncedSearch = useDebouncedValue(urlState.search, 300);
    const [localCurrentPage, setLocalCurrentPage] = useState(1);
    const { currentPage, isDepartmentScoped, setCurrentPage } = useDepartmentScopedPagination({
        localPage: localCurrentPage, searchParams, setLocalPage: setLocalCurrentPage, setSearchParams,
    });
    const [facets, setFacets] = useState<KRIFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure, applySuccess, capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied,
        isLoading, items, setErrorKey, setIsLoading, totalCount,
    } = useCollectionDataState<KeyRiskIndicator, KRIListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();

    const listParams = useMemo(() => buildKriRegisterListParams({
        currentPage, filters: effectiveFilters, groupValue: selectedGroupValue, limit: DEFAULT_LIST_PAGE_SIZE,
        search: debouncedSearch, sort, view: viewMode,
    }), [currentPage, debouncedSearch, effectiveFilters, selectedGroupValue, sort, viewMode]);

    const fetchKris = useCallback(async () => {
        const request = beginRequest();
        setIsLoading(true);
        try {
            const response = await kriApi.getKRIs(listParams);
            if (!isCurrentRequest(request)) return;
            applySuccess({ items: response.items, groups: response.groups ?? [], capabilities: response.capabilities ?? null, total: response.total });
            setFacets(response.facets ?? {});
        } catch (error) {
            if (!isCurrentRequest(request)) return;
            const patch = applyFailure(error, { toErrorKey: apiClient.toUiMessageKey.bind(apiClient) });
            if (patch.isAccessDenied) setFacets({});
        } finally {
            if (isCurrentRequest(request)) setIsLoading(false);
        }
    }, [applyFailure, applySuccess, beginRequest, isCurrentRequest, listParams, setIsLoading]);

    useEffect(() => { if (!isDepartmentScoped) setLocalCurrentPage(1); }, [isDepartmentScoped, serializedParams]);
    useEffect(() => { void fetchKris(); }, [fetchKris]);

    const writeUrl = useCallback((next: {
        filters?: KriRegisterFilters; group?: string | null; search?: string;
        sort?: RegisterSortState | null; view?: KriRegisterView;
    }, replace = false) => {
        const existing = new URLSearchParams(serializedParams);
        existing.delete('monitoring_status');
        existing.delete('timeliness_status');
        existing.delete('status');
        const params = buildRegisterUrlParams({
            filters: serializeKriRegisterFilters(next.filters ?? filters),
            search: next.search ?? urlState.search,
            selectedGroupValue: next.group === undefined ? selectedGroupValue : next.group,
            sort: next.sort === undefined ? sort : next.sort,
            view: next.view ?? viewMode,
        }, existing);
        setSearchParams(resetDepartmentScopedPage(params, isDepartmentScoped), { replace });
        if (!isDepartmentScoped) setCurrentPage(1);
    }, [filters, isDepartmentScoped, selectedGroupValue, serializedParams, setCurrentPage, setSearchParams, sort, urlState.search, viewMode]);

    const updateFilter = useCallback(<K extends keyof KriRegisterFilters>(key: K, value: KriRegisterFilters[K]) => {
        const next = { ...filters, [key]: value };
        if (key === 'timeliness_status' && value) { next.monitoring_status = ''; next.lifecycle = 'active'; }
        if (key === 'monitoring_status' && value) { next.timeliness_status = ''; next.lifecycle = 'active'; }
        if (key === 'breach_only' && value) next.lifecycle = 'active';
        if (key === 'lifecycle' && value !== 'active') next.breach_only = false;
        if (key === 'lifecycle' && value === 'archived') { next.monitoring_status = ''; next.timeliness_status = ''; }
        writeUrl({ filters: next, group: null });
    }, [filters, writeUrl]);
    const clearFilters = useCallback(() => writeUrl({ filters: EMPTY_KRI_REGISTER_FILTERS, group: null }), [writeUrl]);
    const restoreKri = useCallback(async (kriId: number) => {
        try { await kriApi.restoreKRI(kriId); await fetchKris(); }
        catch (error) { setErrorKey(apiClient.toUiMessageKey(error)); }
    }, [fetchKris, setErrorKey]);
    const exportCurrentKris = useCallback(async () => {
        setIsExporting(true);
        try { await kriApi.downloadExport({ ...listParams, offset: 0 }, language); }
        finally { setIsExporting(false); }
    }, [language, listParams]);
    const exportKriSnapshot = useCallback(async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
        setIsExporting(true);
        try {
            await reportApi.exportKRIs({
                format, asOfDate,
                filters: {
                    ...buildKriExportFilters({ search: debouncedSearch, statusFilter: filters.lifecycle === 'archived' ? 'archived' : filters.monitoring_status || 'all', timelinessFilter: filters.timeliness_status || null }),
                    departmentId: departmentScope?.departmentId,
                },
            });
        } finally { setIsExporting(false); }
    }, [debouncedSearch, departmentScope?.departmentId, filters]);

    return {
        capabilities, clearFilters, clearSelectedGroup: () => writeUrl({ group: null }), currentPage,
        errorKey, exportCurrentKris, exportKriSnapshot, facets, fetchKris, filters, groups, hasLoadedOnce,
        isAccessDenied, isExporting, isLoading, items, limit: DEFAULT_LIST_PAGE_SIZE, restoreKri,
        search: urlState.search, selectGroup: (value: string, _label?: string) => writeUrl({ group: value }),
        selectedGroupLabel: groupLabel(groups, selectedGroupValue), selectedGroupValue, setCurrentPage,
        sortDirection: sort?.direction ?? null, sortField: sort?.field ?? null,
        totalCount, totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE), updateFilter,
        updateSearch: (value: string) => writeUrl({ search: value, group: null }, true),
        updateSort: (field: string | null, direction: SortDirection) => writeUrl({ sort: field && direction ? { field, direction } : null }),
        updateViewMode: (view: KriRegisterView) => writeUrl({ view, group: null }), viewMode,
    };
}
