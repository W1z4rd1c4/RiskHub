import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import type { SupportedLanguage } from '@/i18n';
import { apiClient } from '@/services/apiClient';
import { issuesApi } from '@/services/issuesApi';
import { reportApi } from '@/services/reportApi';
import type { IssueFacets, IssueListCapabilities, IssueSummary } from '@/types/issue';

import { useDepartmentRegisterScope } from '../departments/useDepartmentRegisterScope';
import { getTotalPages, useCollectionDataState, useLatestRequestGuard } from '../shared/collectionPageState';
import { useStableRegisterRequestParams } from '../shared/useStableRegisterRequestParams';
import type { RegisterFilters } from '../shared/registerListQuery';
import { useCommittedRegisterQuery, useRegisterUrlWorkingSet } from '../shared/useRegisterUrlWorkingSet';
import { buildIssueExportFilters, parseIssuesPageQueryParams } from './issuesPagePresentation';
import {
    buildIssueRegisterListParams,
    EMPTY_ISSUE_REGISTER_FILTERS,
    ISSUE_REGISTER_CONFIG,
    parseIssueRegisterFilters,
    serializeIssueRegisterFilters,
    type IssueRegisterFilters,
} from './issueRegisterConfig';

const ISSUE_VIEWS = ISSUE_REGISTER_CONFIG.views.map(({ value }) => value);
const ISSUE_SORT_FIELDS = ['title', 'severity', 'status', 'opened_at', 'due_at', 'updated_at', 'created_at', 'department_name', 'owner_user_name'] as const;
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

const issueUrlOptions = {
    allowedViews: ISSUE_VIEWS,
    allowedSortFields: ISSUE_SORT_FIELDS,
    parseFilters: parseIssueRegisterFilters,
    serializeFilters: serializeIssueRegisterFilters,
    readFilters: (raw: RegisterFilters, params: URLSearchParams) => Object.keys(raw).length > 0
        ? parseIssueRegisterFilters(raw) : legacyFilters(params),
    readLegacySort: (params: URLSearchParams) => {
        const legacy = parseIssuesPageQueryParams(params);
        return legacy.sortField && legacy.sortDirection ? { field: legacy.sortField, direction: legacy.sortDirection } : null;
    },
    cleanWriteParams: (params: URLSearchParams) => {
        ['status', 'severity', 'severity_group', 'overdue', 'exclude_active_exceptions', 'include_closed', 'sort_by', 'sort_order'].forEach((key) => params.delete(key));
    },
};

export function useIssuesPageState(language: SupportedLanguage = 'en') {
    const departmentScope = useDepartmentRegisterScope();
    const workingSet = useRegisterUrlWorkingSet(issueUrlOptions);
    const { currentPage, debouncedSearch, filters, selectedGroupValue, sort, viewMode, writeUrl } = workingSet;
    const effectiveFilters = useMemo(() => ({
        ...filters,
        department_id: departmentScope?.departmentId ?? filters.department_id,
    }), [departmentScope?.departmentId, filters]);
    const [facets, setFacets] = useState<IssueFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure, applySuccess, beginQuery, commitQueryIdentity, forQuery,
        isLoading: collectionIsLoading, setIsLoading,
    } = useCollectionDataState<IssueSummary, IssueListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();

    const requestParams = useMemo(() => buildIssueRegisterListParams({
        currentPage, filters: effectiveFilters, groupValue: selectedGroupValue, limit: DEFAULT_LIST_PAGE_SIZE,
        search: debouncedSearch, sort, view: viewMode,
    }), [currentPage, debouncedSearch, effectiveFilters, selectedGroupValue, sort, viewMode]);
    const listParams = useStableRegisterRequestParams(requestParams);
    const { queryIdentity, getExportParams } = useCommittedRegisterQuery(listParams, commitQueryIdentity);
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

    useEffect(() => { void fetchIssues(); }, [fetchIssues]);

    const updateFilter = useCallback(<K extends keyof IssueRegisterFilters>(key: K, value: IssueRegisterFilters[K]) => {
        const next = { ...filters, [key]: value };
        if (key === 'status' && value === 'closed') next.include_closed = true;
        if (key === 'include_closed' && value === false && next.status === 'closed') next.status = '';
        writeUrl({ filters: next, group: null });
    }, [filters, writeUrl]);
    const clearFilters = useCallback(() => writeUrl({ filters: EMPTY_ISSUE_REGISTER_FILTERS, group: null }), [writeUrl]);
    const exportCurrentIssues = useCallback(async () => {
        setIsExporting(true);
        try { await issuesApi.downloadExport(getExportParams(), language); }
        finally { setIsExporting(false); }
    }, [getExportParams, language]);
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
        workingSet,
        capabilities, errorKey, facets: visibleFacets, groups, hasLoadedOnce, isAccessDenied,
        isExporting, isLoading, items, limit: DEFAULT_LIST_PAGE_SIZE,
        totalCount, totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE), updateFilter,
        selectedGroupLabel: groupLabel(groups, selectedGroupValue),
        clearFilters, exportCurrentIssues, exportIssueEvaluation, fetchIssues,
    };
}
