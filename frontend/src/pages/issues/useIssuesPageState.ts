import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { SortDirection } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { SupportedLanguage } from '@/i18n';
import { apiClient } from '@/services/apiClient';
import { issuesApi } from '@/services/issuesApi';
import { reportApi } from '@/services/reportApi';
import type { IssueFacets, IssueListCapabilities, IssueSummary } from '@/types/issue';

import { useDepartmentRegisterScope } from '../departments/useDepartmentRegisterScope';
import { getTotalPages, useCollectionDataState, useLatestRequestGuard } from '../shared/collectionPageState';
import { buildRegisterUrlParams, normalizeRegisterUrlParams, parseRegisterUrlState, type RegisterSortState } from '../shared/registerListQuery';
import { buildIssueExportFilters, parseIssuesPageQueryParams } from './issuesPagePresentation';
import {
    buildIssueRegisterListParams,
    EMPTY_ISSUE_REGISTER_FILTERS,
    ISSUE_REGISTER_CONFIG,
    parseIssueRegisterFilters,
    serializeIssueRegisterFilters,
    type IssueRegisterFilters,
    type IssueRegisterView,
} from './issueRegisterConfig';

const ISSUE_VIEWS = ISSUE_REGISTER_CONFIG.views.map(({ value }) => value);
const ISSUE_SORT_FIELDS = ['title', 'severity', 'status', 'opened_at', 'due_at', 'updated_at', 'created_at'] as const;
const validSort = (sort: RegisterSortState | null) => sort && ISSUE_SORT_FIELDS.includes(sort.field as typeof ISSUE_SORT_FIELDS[number]) ? sort : null;
const groupLabel = (groups: Array<{ value: string; label: string }>, value: string | null) => value ? groups.find((group) => group.value === value)?.label ?? null : null;

function legacyFilters(params: URLSearchParams): IssueRegisterFilters {
    const parsed = parseIssuesPageQueryParams(params);
    return {
        status: parsed.statusFilter,
        severity: parsed.severityFilter,
        overdue: parsed.overdueOnly,
        exclude_active_exceptions: parsed.excludeActiveExceptions,
        include_closed: parsed.includeClosed,
        department_id: null,
        owner_user_id: null,
        remediation_status: '',
    };
}

export function useIssuesPageState(language: SupportedLanguage = 'en') {
    const departmentScope = useDepartmentRegisterScope();
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedParams = searchParams.toString();
    const urlState = useMemo(() => parseRegisterUrlState(new URLSearchParams(serializedParams), {
        defaultView: 'all', allowedViews: ISSUE_VIEWS,
    }), [serializedParams]);
    const filters = useMemo(() => Object.keys(urlState.filters).length > 0
        ? parseIssueRegisterFilters(urlState.filters)
        : legacyFilters(new URLSearchParams(serializedParams)), [serializedParams, urlState.filters]);
    const effectiveFilters = useMemo(() => ({
        ...filters,
        department_id: departmentScope?.departmentId ?? filters.department_id,
    }), [departmentScope?.departmentId, filters]);
    const viewMode = urlState.view as IssueRegisterView;
    const legacyState = useMemo(() => parseIssuesPageQueryParams(new URLSearchParams(serializedParams)), [serializedParams]);
    const sort = useMemo(() => validSort(urlState.sort) ?? (
        legacyState.sortField && legacyState.sortDirection
            ? { field: legacyState.sortField, direction: legacyState.sortDirection }
            : null
    ), [legacyState.sortDirection, legacyState.sortField, urlState.sort]);
    const selectedGroupValue = urlState.selectedGroupValue;
    const debouncedSearch = useDebouncedValue(urlState.search, 300);
    const currentPage = urlState.page;
    const [facets, setFacets] = useState<IssueFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure, applySuccess, beginQuery, commitQueryIdentity, forQuery,
        isLoading: collectionIsLoading, setIsLoading,
    } = useCollectionDataState<IssueSummary, IssueListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();

    const listParams = useMemo(() => buildIssueRegisterListParams({
        currentPage, filters: effectiveFilters, groupValue: selectedGroupValue, limit: DEFAULT_LIST_PAGE_SIZE,
        search: debouncedSearch, sort, view: viewMode,
    }), [currentPage, debouncedSearch, effectiveFilters, selectedGroupValue, sort, viewMode]);
    const queryIdentity = JSON.stringify(listParams);
    useLayoutEffect(() => commitQueryIdentity(queryIdentity), [commitQueryIdentity, queryIdentity]);
    const queryState = forQuery(queryIdentity);
    const { capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied, items, totalCount } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const visibleFacets = queryState.isCurrentQuery ? facets : {};
    const fetchIssues = useCallback(async () => {
        const request = beginRequest();
        if (!beginQuery(queryIdentity)) setFacets({});
        setIsLoading(true);
        try {
            const response = await issuesApi.list(listParams);
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

    useEffect(() => {
        const params = new URLSearchParams(serializedParams);
        if (!normalizeRegisterUrlParams(params, {
            allowedSortFields: ISSUE_SORT_FIELDS,
            allowedViews: ISSUE_VIEWS,
            canonicalizeFilters: (rawFilters) => serializeIssueRegisterFilters(parseIssueRegisterFilters(rawFilters)),
            defaultView: 'all',
        })) return;
        setSearchParams(params, { replace: true });
    }, [serializedParams, setSearchParams]);
    useEffect(() => { void fetchIssues(); }, [fetchIssues]);

    const writeUrl = useCallback((next: {
        filters?: IssueRegisterFilters; group?: string | null; search?: string;
        sort?: RegisterSortState | null; view?: IssueRegisterView;
    }, replace = false) => {
        const existing = new URLSearchParams(serializedParams);
        ['status', 'severity', 'severity_group', 'overdue', 'exclude_active_exceptions', 'include_closed', 'sort_by', 'sort_order'].forEach((key) => existing.delete(key));
        const params = buildRegisterUrlParams({
            filters: serializeIssueRegisterFilters(next.filters ?? filters), page: 1, search: next.search ?? urlState.search,
            selectedGroupValue: next.group === undefined ? selectedGroupValue : next.group,
            sort: next.sort === undefined ? sort : next.sort, view: next.view ?? viewMode,
        }, existing);
        setSearchParams(params, { replace });
    }, [filters, selectedGroupValue, serializedParams, setSearchParams, sort, urlState.search, viewMode]);
    const setCurrentPage = useCallback((page: number) => {
        const params = new URLSearchParams(serializedParams);
        if (page > 1) params.set('page', String(page));
        else params.delete('page');
        setSearchParams(params);
    }, [serializedParams, setSearchParams]);
    const updateFilter = useCallback(<K extends keyof IssueRegisterFilters>(key: K, value: IssueRegisterFilters[K]) => {
        const next = { ...filters, [key]: value };
        if (key === 'status' && value === 'closed') next.include_closed = true;
        if (key === 'include_closed' && value === false && next.status === 'closed') next.status = '';
        writeUrl({ filters: next, group: null });
    }, [filters, writeUrl]);
    const clearFilters = useCallback(() => writeUrl({ filters: EMPTY_ISSUE_REGISTER_FILTERS, group: null }), [writeUrl]);
    const exportCurrentIssues = useCallback(async () => {
        setIsExporting(true);
        try { await issuesApi.downloadExport({ ...listParams, offset: 0 }, language); }
        finally { setIsExporting(false); }
    }, [language, listParams]);
    const exportIssueEvaluation = useCallback(async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
        setIsExporting(true);
        try {
            await reportApi.exportIssues({ format, asOfDate, filters: {
                ...buildIssueExportFilters({
                    statusFilter: filters.status, severityFilter: filters.severity,
                    overdueOnly: filters.overdue, excludeActiveExceptions: filters.exclude_active_exceptions,
                }),
                departmentId: departmentScope?.departmentId,
            } });
        } finally { setIsExporting(false); }
    }, [departmentScope?.departmentId, filters]);

    return {
        capabilities, clearFilters, clearSelectedGroup: () => writeUrl({ group: null }), currentPage,
        errorKey, exportCurrentIssues, exportIssueEvaluation, facets: visibleFacets, fetchIssues, filters, groups,
        hasLoadedOnce, isAccessDenied, isExporting, isLoading, items, limit: DEFAULT_LIST_PAGE_SIZE,
        search: urlState.search, selectGroup: (value: string, _label?: string) => writeUrl({ group: value }),
        selectedGroupLabel: groupLabel(groups, selectedGroupValue), selectedGroupValue, setCurrentPage,
        sortDirection: sort?.direction ?? null, sortField: sort?.field ?? null,
        totalCount, totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE), updateFilter,
        updateSearch: (value: string) => writeUrl({ search: value, group: null }, true),
        updateSort: (field: string | null, direction: SortDirection) => writeUrl({ sort: field && direction ? { field, direction } : null }),
        updateViewMode: (view: IssueRegisterView) => writeUrl({ view, group: null }), viewMode,
    };
}
