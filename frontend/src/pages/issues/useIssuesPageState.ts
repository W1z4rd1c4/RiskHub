import { useCallback } from 'react';

import type { SortDirection, ViewMode } from '@/components/tables';
import { apiClient } from '@/services/apiClient';
import { issuesApi } from '@/services/issuesApi';
import { reportApi } from '@/services/reportApi';
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
    type RegisterFilterPatchResolver,
    type RegisterPageExportRequest,
    type RegisterPageLoadRequest,
    useRegisterPageController,
} from '../shared/useRegisterPageController';

interface UseIssuesPageStateOptions {
    initialState: IssuesPageInitialState;
}

type IssueRegisterFilters = {
    excludeActiveExceptions: boolean;
    includeClosed: boolean;
    overdueOnly: boolean;
    severityFilter: IssueSeverityFilter | '';
    sortDirection: SortDirection;
    sortField: IssueListFilters['sort_by'] | null;
    statusFilter: IssueStatus | '';
};

const resolveIssueFilterPatch: RegisterFilterPatchResolver<IssueRegisterFilters> = ({
    currentFilters,
    key,
    value,
}) => {
    if (key === 'statusFilter' && value === 'closed') {
        return { includeClosed: true };
    }
    if (key === 'includeClosed' && value === false && currentFilters.statusFilter === 'closed') {
        return { statusFilter: '' };
    }
    return {};
};

export function useIssuesPageState({ initialState }: UseIssuesPageStateOptions) {
    const loadIssuePage = useCallback(
        ({
            currentPage,
            debouncedSearch,
            filters,
            groupBy,
            groupValue,
            limit,
        }: RegisterPageLoadRequest<IssueRegisterFilters, ViewMode>) => issuesApi.list(
            buildIssueListFilters({
                currentPage,
                debouncedSearch,
                excludeActiveExceptions: filters.excludeActiveExceptions,
                includeClosed: filters.includeClosed,
                limit,
                overdueOnly: filters.overdueOnly,
                severityFilter: filters.severityFilter,
                sortDirection: filters.sortDirection,
                sortField: filters.sortField,
                statusFilter: filters.statusFilter,
                groupBy,
                groupValue,
            })
        ),
        []
    );
    const toUiErrorKey = useCallback((error: unknown) => apiClient.toUiMessageKey(error), []);

    const submitExport = useCallback(
        async ({
            format,
            asOfDate,
            filters,
        }: RegisterPageExportRequest<IssueRegisterFilters, ViewMode>) => {
            await reportApi.exportIssues({
                format,
                asOfDate,
                filters: buildIssueExportFilters({
                    statusFilter: filters.statusFilter,
                    severityFilter: filters.severityFilter,
                    overdueOnly: filters.overdueOnly,
                    excludeActiveExceptions: filters.excludeActiveExceptions,
                }),
            });
        },
        []
    );

    const registerController = useRegisterPageController<IssueSummary, IssueRegisterFilters, ViewMode>({
        clearOnNonForbidden: true,
        fallbackErrorKey: 'errors.load_failed',
        getGroupBy: getIssueGroupBy,
        initialFilters: {
            excludeActiveExceptions: initialState.excludeActiveExceptions,
            includeClosed: initialState.includeClosed,
            overdueOnly: initialState.overdueOnly,
            severityFilter: initialState.severityFilter,
            sortDirection: initialState.sortDirection,
            sortField: initialState.sortField,
            statusFilter: initialState.statusFilter,
        },
        initialViewMode: 'all',
        loadPage: loadIssuePage,
        resolveFilterPatch: resolveIssueFilterPatch,
        submitExport,
        toExportErrorKey: toUiErrorKey,
        toErrorKey: toUiErrorKey,
    });
    const {
        closeExportDialog,
        fetchCollection: fetchIssues,
        isExportDialogOpen,
        isExporting,
        openExportDialog,
        clearSelectedGroup,
        selectedGroupLabel,
        selectedGroupValue,
        selectGroup,
        updateFilter,
        updateFilters,
    } = registerController;

    const updateStatusFilter = useCallback((value: IssueStatus | '') => {
        updateFilter('statusFilter', value);
    }, [updateFilter]);

    const updateSeverityFilter = useCallback((value: IssueSeverityFilter | '') => {
        updateFilter('severityFilter', value);
    }, [updateFilter]);

    const updateOverdueOnly = useCallback((value: boolean) => {
        updateFilter('overdueOnly', value);
    }, [updateFilter]);

    const updateExcludeActiveExceptions = useCallback((value: boolean) => {
        updateFilter('excludeActiveExceptions', value);
    }, [updateFilter]);

    const updateIncludeClosed = useCallback((value: boolean) => {
        updateFilter('includeClosed', value);
    }, [updateFilter]);

    const updateSort = useCallback(
        (sortField: IssueListFilters['sort_by'] | null, sortDirection: SortDirection) => {
            updateFilters({ sortDirection, sortField });
        },
        [updateFilters]
    );

    return {
        currentPage: registerController.currentPage,
        capabilities: registerController.capabilities,
        errorKey: registerController.errorKey,
        excludeActiveExceptions: registerController.filters.excludeActiveExceptions,
        fetchIssues,
        groups: registerController.groups,
        handleExport: registerController.handleExport,
        hasLoadedOnce: registerController.hasLoadedOnce,
        includeClosed: registerController.filters.includeClosed,
        isExportDialogOpen,
        isExporting,
        isAccessDenied: registerController.isAccessDenied,
        isLoading: registerController.isLoading,
        items: registerController.items,
        limit: registerController.limit,
        openExportDialog,
        closeExportDialog,
        overdueOnly: registerController.filters.overdueOnly,
        search: registerController.search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage: registerController.setCurrentPage,
        severityFilter: registerController.filters.severityFilter,
        sortDirection: registerController.filters.sortDirection,
        sortField: registerController.filters.sortField,
        statusFilter: registerController.filters.statusFilter,
        totalCount: registerController.totalCount,
        totalPages: registerController.totalPages,
        updateExcludeActiveExceptions,
        updateIncludeClosed,
        updateOverdueOnly,
        updateSearch: registerController.updateSearch,
        updateSeverityFilter,
        updateSort,
        updateStatusFilter,
        updateViewMode: registerController.updateViewMode,
        viewMode: registerController.viewMode,
        selectGroup,
        clearSelectedGroup,
    };
}
