import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { apiClient } from '@/services/apiClient';
import { loadCollectionPage } from '@/services/collectionApi';
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
    useCollectionDataState,
    useCollectionPageController,
} from '../shared/collectionPageState';

interface UseIssuesPageStateOptions {
    initialState: IssuesPageInitialState;
}

export function useIssuesPageState({ initialState }: UseIssuesPageStateOptions) {
    const collectionData = useCollectionDataState<IssueSummary>();
    const {
        applyFailure,
        applySuccess,
        setErrorKey,
        setIsLoading,
    } = collectionData;
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
    const {
        beginRequest,
        closeExportDialog,
        isCurrentRequest,
        isExportDialogOpen,
        isExporting,
        openExportDialog,
        resetGroupSelection,
        selectGroup: setSelectedGroup,
        selectedGroupLabel,
        selectedGroupValue,
        setIsExporting,
    } = useCollectionPageController();

    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);
    const groupBy = getIssueGroupBy(viewMode);

    const resetGroupAndPage = useCallback(() => {
        resetGroupSelection();
        setCurrentPage(1);
    }, [resetGroupSelection]);

    const fetchIssues = useCallback(async () => {
        const requestId = beginRequest();
        try {
            setIsLoading(true);

            const response = await loadCollectionPage({
                currentPage,
                groupBy,
                selectedGroupValue,
                loadPage: ({ currentPage, groupBy, groupValue }) => issuesApi.list(
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
            });
            if (!isCurrentRequest(requestId)) {
                return;
            }
            applySuccess(response);
        } catch (loadError) {
            if (!isCurrentRequest(requestId)) {
                return;
            }
            applyFailure(loadError, {
                clearOnNonForbidden: true,
                toErrorKey: (error) => apiClient.toUiMessageKey(error),
            });
        } finally {
            if (isCurrentRequest(requestId)) {
                setIsLoading(false);
            }
        }
    }, [
        applyFailure,
        applySuccess,
        beginRequest,
        currentPage,
        debouncedSearch,
        excludeActiveExceptions,
        groupBy,
        includeClosed,
        isCurrentRequest,
        limit,
        overdueOnly,
        severityFilter,
        selectedGroupValue,
        setIsLoading,
        sortDirection,
        sortField,
        statusFilter,
    ]);

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
        capabilities: collectionData.capabilities,
        errorKey: collectionData.errorKey,
        excludeActiveExceptions,
        fetchIssues,
        groups: collectionData.groups,
        handleExport,
        hasLoadedOnce: collectionData.hasLoadedOnce,
        includeClosed,
        isExportDialogOpen,
        isExporting,
        isAccessDenied: collectionData.isAccessDenied,
        isLoading: collectionData.isLoading,
        items: collectionData.items,
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
        totalCount: collectionData.totalCount,
        totalPages: getTotalPages(collectionData.totalCount, limit),
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
