import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { apiClient } from '@/services/apiClient';
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

interface UseIssuesPageStateOptions {
    canRead: boolean;
    initialState: IssuesPageInitialState;
}

export function useIssuesPageState({ canRead, initialState }: UseIssuesPageStateOptions) {
    const [items, setItems] = useState<IssueSummary[]>([]);
    const [groups, setGroups] = useState<CollectionGroup[]>([]);
    const [selectedGroupValue, setSelectedGroupValue] = useState<string | null>(null);
    const [selectedGroupLabel, setSelectedGroupLabel] = useState<string | null>(null);
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
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const latestRequestIdRef = useRef(0);
    const hasLoadedIssuesRef = useRef(false);

    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);
    const groupBy = getIssueGroupBy(viewMode);

    const listFilters = useMemo(
        () =>
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
            }),
        [
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
        ]
    );

    const fetchIssues = useCallback(async () => {
        if (!canRead) {
            setIsLoading(false);
            return;
        }

        const requestId = ++latestRequestIdRef.current;
        try {
            setIsLoading(true);

            let response;
            if (!groupBy) {
                response = await issuesApi.list(listFilters);
            } else if (selectedGroupValue) {
                response = await issuesApi.list(
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
                        groupValue: selectedGroupValue,
                    })
                );
            } else {
                response = await issuesApi.list(
                    buildIssueListFilters({
                        currentPage: 1,
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
                    })
                );
            }
            if (requestId !== latestRequestIdRef.current) {
                return;
            }
            setItems(response.items);
            setGroups(response.groups ?? []);
            setTotalCount(response.total);
            setErrorKey(null);
            hasLoadedIssuesRef.current = true;
        } catch (loadError) {
            if (requestId !== latestRequestIdRef.current) {
                return;
            }
            setErrorKey(apiClient.toUiMessageKey(loadError));
            setItems([]);
            setGroups([]);
            setTotalCount(0);
        } finally {
            if (requestId === latestRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [
        canRead,
        debouncedSearch,
        excludeActiveExceptions,
        groupBy,
        includeClosed,
        listFilters,
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
                setIsExportDialogOpen(false);
            } catch (exportError) {
                setErrorKey(apiClient.toUiMessageKey(exportError));
            } finally {
                setIsExporting(false);
            }
        },
        [excludeActiveExceptions, overdueOnly, severityFilter, statusFilter]
    );

    const updateSearch = useCallback((value: string) => {
        setSearch(value);
        setCurrentPage(1);
        setSelectedGroupValue(null);
        setSelectedGroupLabel(null);
    }, []);

    const updateStatusFilter = useCallback((value: IssueStatus | '') => {
        setStatusFilter(value);
        if (value === 'closed') {
            setIncludeClosed(true);
        }
        setCurrentPage(1);
        setSelectedGroupValue(null);
        setSelectedGroupLabel(null);
    }, []);

    const updateSeverityFilter = useCallback((value: IssueSeverityFilter | '') => {
        setSeverityFilter(value);
        setCurrentPage(1);
        setSelectedGroupValue(null);
        setSelectedGroupLabel(null);
    }, []);

    const updateOverdueOnly = useCallback((value: boolean) => {
        setOverdueOnly(value);
        setCurrentPage(1);
        setSelectedGroupValue(null);
        setSelectedGroupLabel(null);
    }, []);

    const updateExcludeActiveExceptions = useCallback((value: boolean) => {
        setExcludeActiveExceptions(value);
        setCurrentPage(1);
        setSelectedGroupValue(null);
        setSelectedGroupLabel(null);
    }, []);

    const updateIncludeClosed = useCallback(
        (value: boolean) => {
            setIncludeClosed(value);
            if (!value && statusFilter === 'closed') {
                setStatusFilter('');
            }
            setCurrentPage(1);
            setSelectedGroupValue(null);
            setSelectedGroupLabel(null);
        },
        [statusFilter]
    );

    const updateSort = useCallback(
        (nextSortField: IssueListFilters['sort_by'] | null, nextSortDirection: SortDirection) => {
            setSortField(nextSortField);
            setSortDirection(nextSortDirection);
            setCurrentPage(1);
            setSelectedGroupValue(null);
            setSelectedGroupLabel(null);
        },
        []
    );

    const updateViewMode = useCallback((value: ViewMode) => {
        setViewMode(value);
        setCurrentPage(1);
        setSelectedGroupValue(null);
        setSelectedGroupLabel(null);
    }, []);

    const selectGroup = useCallback((groupValue: string, groupLabel: string) => {
        setSelectedGroupValue(groupValue);
        setSelectedGroupLabel(groupLabel);
        setCurrentPage(1);
    }, []);

    const clearSelectedGroup = useCallback(() => {
        setSelectedGroupValue(null);
        setSelectedGroupLabel(null);
        setCurrentPage(1);
    }, []);

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
        openExportDialog: () => setIsExportDialogOpen(true),
        closeExportDialog: () => setIsExportDialogOpen(false),
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
        totalPages: Math.ceil(totalCount / limit) || 1,
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
