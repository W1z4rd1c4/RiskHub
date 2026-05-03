import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { apiClient } from '@/services/apiClient';
import { issuesApi } from '@/services/issuesApi';
import { reportApi } from '@/services/reportApi';
import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { SortDirection, ViewMode } from '@/components/tables';
import type {
    IssueListFilters,
    IssueSeverityFilter,
    IssueStatus,
    IssueSummary,
} from '@/types/issue';

import {
    buildIssueExportFilters,
    buildIssueListFilters,
    getIssueGroupBy,
    type IssuesPageInitialState,
} from './issuesPagePresentation';
import {
    getTotalPages,
} from '../shared/collectionPageState';
import {
    type CollectionWorkflowLoadRequest,
    useCollectionPageWorkflow,
} from '../shared/collectionPageWorkflow';

interface UseIssuesPageStateOptions {
    initialState: IssuesPageInitialState;
}

export function useIssuesPageState({ initialState }: UseIssuesPageStateOptions) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<IssueStatus | ''>(initialState.statusFilter);
    const [severityFilter, setSeverityFilter] = useState<IssueSeverityFilter | ''>(
        initialState.severityFilter
    );
    const [overdueOnly, setOverdueOnly] = useState(initialState.overdueOnly);
    const [excludeActiveExceptions, setExcludeActiveExceptions] = useState(
        initialState.excludeActiveExceptions
    );
    const [includeClosed, setIncludeClosed] = useState(initialState.includeClosed);
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [sortField, setSortField] = useState<IssueListFilters['sort_by'] | null>(
        initialState.sortField
    );
    const [sortDirection, setSortDirection] = useState<SortDirection>(initialState.sortDirection);
    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);
    const groupBy = getIssueGroupBy(viewMode);

    const loadIssuePage = useCallback(
        ({ currentPage, groupBy, groupValue }: CollectionWorkflowLoadRequest) => issuesApi.list(
            buildIssueListFilters({
                currentPage,
                debouncedSearch,
                excludeActiveExceptions,
                includeClosed,
                limit,
                overdueOnly,
                severityFilter,
                sortDirection,
                sortField,
                statusFilter,
                groupBy,
                groupValue,
            })
        ),
        [
            debouncedSearch,
            excludeActiveExceptions,
            includeClosed,
            limit,
            overdueOnly,
            severityFilter,
            sortDirection,
            sortField,
            statusFilter,
        ]
    );
    const toUiErrorKey = useCallback((error: unknown) => apiClient.toUiMessageKey(error), []);

    const collectionWorkflow = useCollectionPageWorkflow<IssueSummary>({
        clearOnNonForbidden: true,
        currentPage,
        groupBy,
        loadPage: loadIssuePage,
        toErrorKey: toUiErrorKey,
    });
    const {
        closeExportDialog,
        fetchCollection: fetchIssues,
        isExportDialogOpen,
        isExporting,
        openExportDialog,
        resetGroupSelection,
        selectGroup: setSelectedGroup,
        selectedGroupLabel,
        selectedGroupValue,
        setErrorKey,
        setIsExporting,
    } = collectionWorkflow;

    const resetGroupAndPage = useCallback(() => {
        resetGroupSelection();
        setCurrentPage(1);
    }, [resetGroupSelection]);

    useEffect(() => {
        void fetchIssues();
    }, [fetchIssues]);

    const handleExport = useCallback(
        async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
            setIsExporting(true);
            try {
                await reportApi.exportIssues({
                    format,
                    asOfDate,
                    filters: buildIssueExportFilters({
                        statusFilter,
                        severityFilter,
                        overdueOnly,
                        excludeActiveExceptions,
                    }),
                });
                closeExportDialog();
            } catch (exportError) {
                setErrorKey(apiClient.toUiMessageKey(exportError));
            } finally {
                setIsExporting(false);
            }
        },
        [
            closeExportDialog,
            excludeActiveExceptions,
            overdueOnly,
            setErrorKey,
            setIsExporting,
            severityFilter,
            statusFilter,
        ]
    );

    const updateSearch = useCallback((value: string) => {
        setSearch(value);
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const updateStatusFilter = useCallback((value: IssueStatus | '') => {
        setStatusFilter(value);
        if (value === 'closed') {
            setIncludeClosed(true);
        }
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const updateSeverityFilter = useCallback((value: IssueSeverityFilter | '') => {
        setSeverityFilter(value);
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const updateOverdueOnly = useCallback((value: boolean) => {
        setOverdueOnly(value);
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const updateExcludeActiveExceptions = useCallback((value: boolean) => {
        setExcludeActiveExceptions(value);
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const updateIncludeClosed = useCallback(
        (value: boolean) => {
            setIncludeClosed(value);
            if (!value && statusFilter === 'closed') {
                setStatusFilter('');
            }
            resetGroupAndPage();
        },
        [resetGroupAndPage, statusFilter]
    );

    const updateSort = useCallback(
        (nextSortField: IssueListFilters['sort_by'] | null, nextSortDirection: SortDirection) => {
            setSortField(nextSortField);
            setSortDirection(nextSortDirection);
            resetGroupAndPage();
        },
        [resetGroupAndPage]
    );

    const updateViewMode = useCallback((value: ViewMode) => {
        setViewMode(value);
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const selectGroup = useCallback((groupValue: string, groupLabel: string) => {
        setSelectedGroup(groupValue, groupLabel);
        setCurrentPage(1);
    }, [setSelectedGroup]);

    const clearSelectedGroup = useCallback(() => {
        resetGroupSelection();
        setCurrentPage(1);
    }, [resetGroupSelection]);

    return {
        currentPage,
        capabilities: collectionWorkflow.capabilities,
        errorKey: collectionWorkflow.errorKey,
        excludeActiveExceptions,
        fetchIssues,
        groups: collectionWorkflow.groups,
        handleExport,
        hasLoadedOnce: collectionWorkflow.hasLoadedOnce,
        includeClosed,
        isExportDialogOpen,
        isExporting,
        isAccessDenied: collectionWorkflow.isAccessDenied,
        isLoading: collectionWorkflow.isLoading,
        items: collectionWorkflow.items,
        limit,
        openExportDialog,
        closeExportDialog,
        overdueOnly,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        severityFilter,
        sortDirection,
        sortField,
        statusFilter,
        totalCount: collectionWorkflow.totalCount,
        totalPages: getTotalPages(collectionWorkflow.totalCount, limit),
        updateExcludeActiveExceptions,
        updateIncludeClosed,
        updateOverdueOnly,
        updateSearch,
        updateSeverityFilter,
        updateSort,
        updateStatusFilter,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup,
    };
}
