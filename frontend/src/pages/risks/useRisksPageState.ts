import { useCallback } from 'react';

import type { SortDirection, ViewMode } from '@/components/tables';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import { logError } from '@/services/logger';
import { reportApi } from '@/services/reportApi';
import { riskApi } from '@/services/riskApi';
import type { RiskSummary } from '@/types/risk';

import {
    buildRiskExportFilters,
    buildRiskListParams,
    getRiskGroupBy,
    normalizeRiskSummaries,
    type RiskListStatusFilter,
    type RisksPageInitialState,
} from './risksPagePresentation';
import {
    type RegisterPageExportRequest,
    type RegisterPageLoadRequest,
    useRegisterPageController,
} from '../shared/useRegisterPageController';

interface UseRisksPageStateOptions {
    initialState: RisksPageInitialState;
}

type RiskRegisterFilters = {
    criticalFilter: boolean;
    hasBreachFilter: boolean | undefined;
    priorityFilter: boolean | undefined;
    sortDirection: SortDirection;
    sortField: string | null;
    statusFilter: RiskListStatusFilter;
    typeFilter: string;
};

export function useRisksPageState({ initialState }: UseRisksPageStateOptions) {
    const { thresholds } = useRiskThresholds();

    const loadRiskPage = useCallback(
        ({
            currentPage,
            debouncedSearch,
            filters,
            groupBy,
            groupValue,
            limit,
        }: RegisterPageLoadRequest<RiskRegisterFilters, ViewMode>) => riskApi.getRisks(
            buildRiskListParams({
                criticalMinNetScore: thresholds.critical,
                currentPage,
                criticalFilter: filters.criticalFilter,
                hasBreachFilter: filters.hasBreachFilter,
                limit,
                priorityFilter: filters.priorityFilter,
                search: debouncedSearch,
                sortDirection: filters.sortDirection,
                sortField: filters.sortField,
                statusFilter: filters.statusFilter,
                typeFilter: filters.typeFilter,
                groupBy,
                groupValue,
            })
        ),
        [thresholds.critical]
    );

    const logLoadError = useCallback((error: unknown) => {
        logError('[RisksPage] Error fetching risks:', error);
    }, []);

    const submitExport = useCallback(
        async ({
            format,
            asOfDate,
            filters,
            search,
        }: RegisterPageExportRequest<RiskRegisterFilters, ViewMode>) => {
            await reportApi.exportRisks({
                format,
                asOfDate,
                filters: buildRiskExportFilters({
                    priorityFilter: filters.priorityFilter,
                    search,
                    statusFilter: filters.statusFilter,
                    typeFilter: filters.typeFilter,
                }),
            });
        },
        []
    );

    const logExportError = useCallback((error: unknown) => {
        logError('Export failed:', error);
    }, []);

    const registerController = useRegisterPageController<RiskSummary, RiskRegisterFilters, ViewMode>({
        fallbackErrorKey: 'errors.load_failed',
        getGroupBy: getRiskGroupBy,
        initialFilters: {
            criticalFilter: initialState.criticalFilter,
            hasBreachFilter: initialState.hasBreachFilter,
            priorityFilter: undefined,
            sortDirection: null,
            sortField: null,
            statusFilter: 'active',
            typeFilter: '',
        },
        initialViewMode: 'all',
        loadPage: loadRiskPage,
        normalizeItems: normalizeRiskSummaries,
        onExportError: logExportError,
        onLoadError: logLoadError,
        submitExport,
    });
    const {
        closeExportDialog,
        fetchCollection: fetchRisks,
        isExportDialogOpen,
        isExporting,
        openExportDialog,
        clearSelectedGroup,
        selectedGroupLabel,
        selectedGroupValue,
        setErrorKey,
        selectGroup,
        updateFilter,
        updateFilters,
    } = registerController;

    const restoreRisk = useCallback(
        async (riskId: number) => {
            try {
                await riskApi.restoreRisk(riskId);
                await fetchRisks();
            } catch (error) {
                logError('Failed to restore risk:', error);
                setErrorKey('errors.load_failed');
            }
        },
        [fetchRisks, setErrorKey]
    );

    const updateStatusFilter = useCallback((value: RiskListStatusFilter) => {
        updateFilter('statusFilter', value);
    }, [updateFilter]);

    const updateTypeFilter = useCallback((value: string) => {
        updateFilter('typeFilter', value);
    }, [updateFilter]);

    const togglePriorityFilter = useCallback(() => {
        updateFilter('priorityFilter', registerController.filters.priorityFilter === true ? undefined : true);
    }, [registerController.filters.priorityFilter, updateFilter]);

    const updateCriticalFilter = useCallback((value: boolean) => {
        updateFilter('criticalFilter', value);
    }, [updateFilter]);

    const updateHasBreachFilter = useCallback((value: boolean | undefined) => {
        updateFilter('hasBreachFilter', value);
    }, [updateFilter]);

    const updateSort = useCallback((sortField: string | null, sortDirection: SortDirection) => {
        updateFilters({ sortDirection, sortField });
    }, [updateFilters]);

    return {
        criticalFilter: registerController.filters.criticalFilter,
        capabilities: registerController.capabilities,
        currentPage: registerController.currentPage,
        errorKey: registerController.errorKey,
        fetchRisks,
        groups: registerController.groups,
        handleExport: registerController.handleExport,
        hasBreachFilter: registerController.filters.hasBreachFilter,
        hasLoadedOnce: registerController.hasLoadedOnce,
        isExportDialogOpen,
        isExporting,
        isAccessDenied: registerController.isAccessDenied,
        isLoading: registerController.isLoading,
        items: registerController.items,
        limit: registerController.limit,
        openExportDialog,
        closeExportDialog,
        priorityFilter: registerController.filters.priorityFilter,
        restoreRisk,
        search: registerController.search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage: registerController.setCurrentPage,
        sortDirection: registerController.filters.sortDirection,
        sortField: registerController.filters.sortField,
        statusFilter: registerController.filters.statusFilter,
        totalCount: registerController.totalCount,
        totalPages: registerController.totalPages,
        typeFilter: registerController.filters.typeFilter,
        updateCriticalFilter,
        updateHasBreachFilter,
        updateSearch: registerController.updateSearch,
        updateSort,
        updateStatusFilter,
        updateTypeFilter,
        updateViewMode: registerController.updateViewMode,
        viewMode: registerController.viewMode,
        selectGroup,
        clearSelectedGroup,
        togglePriorityFilter,
    };
}
