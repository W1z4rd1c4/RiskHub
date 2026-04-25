import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { apiClient } from '@/services/apiClient';
import { loadCollectionPage } from '@/services/collectionApi';
import { issuesApi } from '@/services/issuesApi';
import { reportApi } from '@/services/reportApi';
import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { SortDirection, ViewMode } from '@/components/tables';
import type { CollectionGroup } from '@/types/collection';
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
    useCollectionGroupSelection,
    useExportDialogState,
    useLatestRequestGuard,
} from '../shared/collectionPageState';

interface UseIssuesPageStateOptions {
    canRead: boolean;
    initialState: IssuesPageInitialState;
}

export function useIssuesPageState({ canRead, initialState }: UseIssuesPageStateOptions) {
    const [items, setItems] = useState<IssueSummary[]>([]);
    const [groups, setGroups] = useState<CollectionGroup[]>([]);
    const [totalCount, setTotalCount] = useState(0);
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
    const [isLoading, setIsLoading] = useState(canRead);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();
    const {
        resetGroupSelection,
        selectGroup: setSelectedGroup,
        selectedGroupLabel,
        selectedGroupValue,
    } = useCollectionGroupSelection();
    const {
        closeExportDialog,
        isExportDialogOpen,
        isExporting,
        openExportDialog,
        setIsExporting,
    } = useExportDialogState();
    const hasLoadedIssuesRef = useRef(false);

    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);
    const groupBy = getIssueGroupBy(viewMode);

    const resetGroupAndPage = useCallback(() => {
        resetGroupSelection();
        setCurrentPage(1);
    }, [resetGroupSelection]);

    const fetchIssues = useCallback(async () => {
        if (!canRead) {
            setIsLoading(false);
            return;
        }

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
            setItems(response.items);
            setGroups(response.groups);
            setTotalCount(response.total);
            setErrorKey(null);
            hasLoadedIssuesRef.current = true;
        } catch (loadError) {
            if (!isCurrentRequest(requestId)) {
                return;
            }
            setErrorKey(apiClient.toUiMessageKey(loadError));
            setItems([]);
            setGroups([]);
            setTotalCount(0);
        } finally {
            if (isCurrentRequest(requestId)) {
                setIsLoading(false);
            }
        }
    }, [
        beginRequest,
        canRead,
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
        [closeExportDialog, excludeActiveExceptions, overdueOnly, setIsExporting, severityFilter, statusFilter]
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
        errorKey,
        excludeActiveExceptions,
        fetchIssues,
        groups,
        handleExport,
        hasLoadedOnce: hasLoadedIssuesRef.current,
        includeClosed,
        isExportDialogOpen,
        isExporting,
        isLoading,
        items,
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
        totalCount,
        totalPages: getTotalPages(totalCount, limit),
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
