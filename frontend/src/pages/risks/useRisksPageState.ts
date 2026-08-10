import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { SortDirection } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import type { SupportedLanguage } from '@/i18n';
import { apiClient } from '@/services/apiClient';
import { reportApi } from '@/services/reportApi';
import { riskApi } from '@/services/riskApi';
import type { RiskFacets, RiskListCapabilities, RiskSummary } from '@/types/risk';

import { useDepartmentRegisterScope } from '../departments/useDepartmentRegisterScope';
import { resetDepartmentScopedPage, useDepartmentScopedPagination } from '../departments/useDepartmentScopedPagination';
import type { RiskSemanticFilters } from '../shared/ictRegisterSemanticFilters';
import { getTotalPages, useCollectionDataState, useLatestRequestGuard } from '../shared/collectionPageState';
import { buildRegisterUrlParams, parseRegisterUrlState, type RegisterSortState } from '../shared/registerListQuery';
import {
    buildRiskRegisterListParams,
    EMPTY_RISK_REGISTER_FILTERS,
    parseRiskRegisterFilters,
    RISK_REGISTER_CONFIG,
    serializeRiskRegisterFilters,
    type RiskLifecycleFilter,
    type RiskRegisterFilters,
    type RiskRegisterView,
} from './riskRegisterConfig';
import { normalizeRiskSummaries } from './risksPagePresentation';

const RISK_VIEWS = RISK_REGISTER_CONFIG.views.map(({ value }) => value);
const RISK_SORT_FIELDS = [
    'name', 'description', 'status', 'risk_id_code', 'category', 'risk_type',
    'gross_score', 'net_score', 'kri_count', 'control_count',
] as const;

function validSort(sort: RegisterSortState | null): RegisterSortState | null {
    return sort && RISK_SORT_FIELDS.includes(sort.field as typeof RISK_SORT_FIELDS[number]) ? sort : null;
}

function selectedGroupLabel(groups: Array<{ value: string; label: string }>, value: string | null) {
    return value ? groups.find((group) => group.value === value)?.label ?? null : null;
}

export function useRisksPageState(
    semanticFilters: RiskSemanticFilters = {},
    language: SupportedLanguage = 'en',
) {
    const departmentScope = useDepartmentRegisterScope();
    const { thresholds } = useRiskThresholds();
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedParams = searchParams.toString();
    const urlState = useMemo(() => parseRegisterUrlState(new URLSearchParams(serializedParams), {
        defaultView: 'all', allowedViews: RISK_VIEWS,
    }), [serializedParams]);
    const filters = useMemo(() => {
        const parsed = parseRiskRegisterFilters(urlState.filters);
        const legacy = new URLSearchParams(serializedParams);
        return {
            ...parsed,
            critical: urlState.filters.critical === undefined && legacy.get('critical') === 'true' ? true : parsed.critical,
            has_breach: urlState.filters.has_breach === undefined && legacy.get('breached') === 'true' ? true : parsed.has_breach,
        };
    }, [serializedParams, urlState.filters]);
    const viewMode = urlState.view as RiskRegisterView;
    const sort = validSort(urlState.sort);
    const groupValue = urlState.selectedGroupValue;
    const debouncedSearch = useDebouncedValue(urlState.search, 300);
    const [localCurrentPage, setLocalCurrentPage] = useState(1);
    const { currentPage, isDepartmentScoped, setCurrentPage } = useDepartmentScopedPagination({
        localPage: localCurrentPage, searchParams, setLocalPage: setLocalCurrentPage, setSearchParams,
    });
    const [facets, setFacets] = useState<RiskFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure, applySuccess, capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied,
        isLoading, items, setErrorKey, setIsLoading, totalCount,
    } = useCollectionDataState<RiskSummary, RiskListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();

    const listParams = useMemo(() => {
        const { committee_scope: committeeScope, ...rawApiSemanticFilters } = semanticFilters;
        const apiSemanticFilters = Object.fromEntries(
            Object.entries(rawApiSemanticFilters).filter(([, value]) => value !== undefined),
        );
        const effectiveFilters = committeeScope === true
            ? { ...filters, lifecycle: 'all' as const, status: '' as const }
            : filters;
        return {
            ...buildRiskRegisterListParams({
                criticalMinNetScore: thresholds.critical,
                currentPage,
                filters: effectiveFilters,
                groupValue,
                limit: DEFAULT_LIST_PAGE_SIZE,
                search: debouncedSearch,
                sort,
                view: viewMode,
            }),
            ...apiSemanticFilters,
            department_id: departmentScope?.departmentId,
        };
    }, [currentPage, debouncedSearch, departmentScope?.departmentId, filters, groupValue, semanticFilters, sort, thresholds.critical, viewMode]);

    const fetchRisks = useCallback(async () => {
        const request = beginRequest();
        setIsLoading(true);
        try {
            const response = await riskApi.getRisks(listParams);
            if (!isCurrentRequest(request)) return;
            applySuccess({
                items: normalizeRiskSummaries(response.items),
                groups: response.groups ?? [],
                capabilities: response.capabilities ?? null,
                total: response.total,
            });
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
    useEffect(() => { void fetchRisks(); }, [fetchRisks]);

    const writeUrl = useCallback((next: {
        filters?: RiskRegisterFilters;
        group?: string | null;
        search?: string;
        sort?: RegisterSortState | null;
        view?: RiskRegisterView;
    }, replace = false) => {
        const existing = new URLSearchParams(serializedParams);
        existing.delete('critical');
        existing.delete('breached');
        const params = buildRegisterUrlParams({
            filters: serializeRiskRegisterFilters(next.filters ?? filters),
            search: next.search ?? urlState.search,
            selectedGroupValue: next.group === undefined ? groupValue : next.group,
            sort: next.sort === undefined ? sort : next.sort,
            view: next.view ?? viewMode,
        }, existing);
        setSearchParams(resetDepartmentScopedPage(params, isDepartmentScoped), { replace });
        if (!isDepartmentScoped) setCurrentPage(1);
    }, [filters, groupValue, isDepartmentScoped, serializedParams, setCurrentPage, setSearchParams, sort, urlState.search, viewMode]);

    const updateFilter = useCallback(<K extends keyof RiskRegisterFilters>(key: K, value: RiskRegisterFilters[K]) => {
        writeUrl({ filters: { ...filters, [key]: value }, group: null });
    }, [filters, writeUrl]);
    const clearFilters = useCallback(
        () => writeUrl({ filters: EMPTY_RISK_REGISTER_FILTERS, group: null }),
        [writeUrl],
    );
    const restoreRisk = useCallback(async (riskId: number) => {
        try { await riskApi.restoreRisk(riskId); await fetchRisks(); }
        catch (error) { setErrorKey(apiClient.toUiMessageKey(error)); }
    }, [fetchRisks, setErrorKey]);
    const exportCurrentRisks = useCallback(async () => {
        setIsExporting(true);
        try {
            await riskApi.downloadExport({ ...listParams, offset: 0 }, language);
        }
        finally { setIsExporting(false); }
    }, [language, listParams]);
    const exportRiskSnapshot = useCallback(async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
        setIsExporting(true);
        try {
            await reportApi.exportRisks({
                format,
                asOfDate,
                filters: {
                    departmentId: departmentScope?.departmentId,
                    status: filters.lifecycle === 'archived'
                        ? 'archived'
                        : filters.lifecycle === 'all'
                            ? null
                            : filters.status || null,
                    search: debouncedSearch.trim() || null,
                    riskType: filters.risk_type || null,
                    isPriority: filters.is_priority,
                },
            });
        }
        finally { setIsExporting(false); }
    }, [debouncedSearch, departmentScope?.departmentId, filters]);

    return {
        capabilities, clearFilters, clearSelectedGroup: () => writeUrl({ group: null }), currentPage,
        errorKey, exportCurrentRisks, exportRiskSnapshot, facets, fetchRisks, filters, groups, hasLoadedOnce, isAccessDenied,
        isExporting, isLoading, items, limit: DEFAULT_LIST_PAGE_SIZE, restoreRisk, search: urlState.search,
        selectGroup: (value: string, _label?: string) => writeUrl({ group: value }),
        selectedGroupLabel: selectedGroupLabel(groups, groupValue), selectedGroupValue: groupValue, setCurrentPage,
        sortDirection: sort?.direction ?? null, sortField: sort?.field ?? null,
        statusFilter: filters.lifecycle === 'archived' ? 'archived' : filters.status,
        totalCount, totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE), updateFilter,
        updateSearch: (value: string) => writeUrl({ search: value, group: null }, true),
        updateSort: (field: string | null, direction: SortDirection) => writeUrl({ sort: field && direction ? { field, direction } : null }),
        updateStatusFilter: (value: RiskLifecycleFilter) => updateFilter('lifecycle', value),
        updateViewMode: (view: RiskRegisterView) => writeUrl({ view, group: null }), viewMode,
    };
}
