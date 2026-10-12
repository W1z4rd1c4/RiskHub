import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import type { SupportedLanguage } from '@/i18n';
import { apiClient } from '@/services/apiClient';
import { kriApi } from '@/services/kriApi';
import { reportApi } from '@/services/reportApi';
import type { KRIFacets, KRIListCapabilities, KeyRiskIndicator } from '@/types/kri';

import { useDepartmentRegisterScope } from '../departments/useDepartmentRegisterScope';
import { getTotalPages, useCollectionDataState, useLatestRequestGuard } from '../shared/collectionPageState';
import { useStableRegisterRequestParams } from '../shared/useStableRegisterRequestParams';
import type { RegisterFilters } from '../shared/registerListQuery';
import { useCommittedRegisterQuery, useRegisterUrlWorkingSet } from '../shared/useRegisterUrlWorkingSet';
import { useRestoreWithFeedback } from '../shared/useRestoreWithFeedback';
import { buildKriExportFilters, readKriRouteFilters } from './kriPagePresentation';
import {
    buildKriRegisterListParams,
    EMPTY_KRI_REGISTER_FILTERS,
    KRI_REGISTER_CONFIG,
    parseKriRegisterFilters,
    serializeKriRegisterFilters,
    type KriRegisterFilters,
} from './kriRegisterConfig';

const KRI_VIEWS = KRI_REGISTER_CONFIG.views.map(({ value }) => value);
const KRI_SORT_FIELDS = ['metric_name', 'current_value', 'monitoring_status', 'risk_process', 'risk_description'] as const;
const groupLabel = (groups: Array<{ value: string; label: string }>, value: string | null) => value ? groups.find((group) => group.value === value)?.label ?? null : null;

function parseLegacyFilters(params: URLSearchParams): Partial<KriRegisterFilters> {
    const legacy = readKriRouteFilters(params, ['new', 'not_submitted', 'breach', 'warning', 'optimal'], ['due_soon']);
    return {
        lifecycle: legacy.statusFilter === 'archived' ? 'archived' : 'active',
        monitoring_status: legacy.statusFilter !== 'all' && legacy.statusFilter !== 'archived' ? legacy.statusFilter : '',
        timeliness_status: legacy.timelinessFilter ?? '',
    };
}

const kriUrlOptions = {
    allowedViews: KRI_VIEWS,
    allowedSortFields: KRI_SORT_FIELDS,
    parseFilters: parseKriRegisterFilters,
    serializeFilters: serializeKriRegisterFilters,
    readFilters: (raw: RegisterFilters, params: URLSearchParams) => Object.keys(raw).length > 0
        ? parseKriRegisterFilters(raw)
        : { ...EMPTY_KRI_REGISTER_FILTERS, ...parseLegacyFilters(params) },
    cleanWriteParams: (params: URLSearchParams) => {
        ['monitoring_status', 'timeliness_status', 'status'].forEach((key) => params.delete(key));
    },
};

export function useKrisPageState(language: SupportedLanguage = 'en') {
    const departmentScope = useDepartmentRegisterScope();
    const workingSet = useRegisterUrlWorkingSet(kriUrlOptions);
    const { currentPage, debouncedSearch, filters, selectedGroupValue, sort, viewMode, writeUrl } = workingSet;
    const effectiveFilters = useMemo(() => ({
        ...filters,
        department_id: departmentScope?.departmentId ?? filters.department_id,
    }), [departmentScope?.departmentId, filters]);
    const [facets, setFacets] = useState<KRIFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure, applySuccess, beginQuery, commitQueryIdentity, forQuery,
        isLoading: collectionIsLoading, isQueryCurrent,
        setIsLoading,
    } = useCollectionDataState<KeyRiskIndicator, KRIListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();
    const runRowRestore = useRestoreWithFeedback();

    const requestParams = useMemo(() => buildKriRegisterListParams({
        currentPage, filters: effectiveFilters, groupValue: selectedGroupValue, limit: DEFAULT_LIST_PAGE_SIZE,
        search: debouncedSearch, sort, view: viewMode,
    }), [currentPage, debouncedSearch, effectiveFilters, selectedGroupValue, sort, viewMode]);
    const listParams = useStableRegisterRequestParams(requestParams);
    const { queryIdentity, getExportParams } = useCommittedRegisterQuery(listParams, commitQueryIdentity);
    const queryState = forQuery(queryIdentity);
    const { capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied, items, totalCount } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const visibleFacets = queryState.isCurrentQuery ? facets : {};

    const fetchKris = useCallback(async () => {
        const request = beginRequest();
        if (!beginQuery(queryIdentity)) setFacets({});
        setIsLoading(true);
        try {
            const response = await kriApi.getKRIs(listParams);
            if (!isCurrentRequest(request)) return;
            applySuccess(queryIdentity, { items: response.items, groups: response.groups ?? [], capabilities: response.capabilities ?? null, total: response.total });
            setFacets(response.facets ?? {});
        } catch (error) {
            if (!isCurrentRequest(request)) return;
            const patch = applyFailure(error, { toErrorKey: apiClient.toUiMessageKey.bind(apiClient) });
            if (patch.isAccessDenied) setFacets({});
        } finally {
            if (isCurrentRequest(request)) setIsLoading(false);
        }
    }, [applyFailure, applySuccess, beginQuery, beginRequest, isCurrentRequest, listParams, queryIdentity, setIsLoading]);

    useEffect(() => { void fetchKris(); }, [fetchKris]);

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
    // D9 / FB-01: a row restore reports through a toast and never flips the
    // register into its error state.
    const restoreKri = useCallback(async (kriId: number) => {
        const restoreQueryIdentity = queryIdentity;
        await runRowRestore({
            restore: () => kriApi.restoreKRI(kriId),
            name: items.find((item) => item.id === kriId)?.metric_name,
            refresh: async () => {
                if (isQueryCurrent(restoreQueryIdentity)) await fetchKris();
            },
        });
    }, [fetchKris, isQueryCurrent, items, queryIdentity, runRowRestore]);
    const exportCurrentKris = useCallback(async () => {
        setIsExporting(true);
        try { await kriApi.downloadExport(getExportParams(), language); }
        finally { setIsExporting(false); }
    }, [getExportParams, language]);
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
        ...workingSet,
        capabilities, errorKey, facets: visibleFacets, groups, hasLoadedOnce, isAccessDenied,
        isExporting, isLoading, items, limit: DEFAULT_LIST_PAGE_SIZE,
        totalCount, totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE), updateFilter,
        selectedGroupLabel: groupLabel(groups, selectedGroupValue),
        clearFilters, exportCurrentKris, exportKriSnapshot, fetchKris, restoreKri,
    };
}
