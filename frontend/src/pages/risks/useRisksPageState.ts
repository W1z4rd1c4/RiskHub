import { useCallback, useEffect, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { SortDirection, ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { logError } from '@/services/logger';
import { reportApi } from '@/services/reportApi';
import { riskApi } from '@/services/riskApi';
import type { RiskStatus, RiskSummary } from '@/types/risk';

import {
    buildRiskExportFilters,
    buildRiskListParams,
    getRiskGroupBy,
    normalizeRiskSummaries,
    type RisksPageInitialState,
} from './risksPagePresentation';
import {
    getTotalPages,
} from '../shared/collectionPageState';
import {
    type CollectionWorkflowLoadRequest,
    useCollectionPageWorkflow,
} from '../shared/collectionPageWorkflow';
import { resetCollectionGroupAndPage } from '../shared/collectionViewVocabulary';
import { applyRegisterViewModeChange } from '../shared/useRegisterPageWorkflow';

interface UseRisksPageStateOptions {
    initialState: RisksPageInitialState;
}

export function useRisksPageState({ initialState }: UseRisksPageStateOptions) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<RiskStatus | ''>('active');
    const [typeFilter, setTypeFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState<boolean | undefined>(undefined);
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [hasBreachFilter, setHasBreachFilter] = useState<boolean | undefined>(
        initialState.hasBreachFilter
    );
    const [criticalFilter, setCriticalFilter] = useState(initialState.criticalFilter);
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);

    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);
    const groupBy = getRiskGroupBy(viewMode);

    const loadRiskPage = useCallback(
        ({ currentPage, groupBy, groupValue }: CollectionWorkflowLoadRequest) => riskApi.getRisks(
            buildRiskListParams({
                currentPage,
                criticalFilter,
                hasBreachFilter,
                limit,
                priorityFilter,
                search: debouncedSearch,
                sortDirection,
                sortField,
                statusFilter,
                typeFilter,
                groupBy,
                groupValue,
            })
        ),
        [
            criticalFilter,
            debouncedSearch,
            hasBreachFilter,
            limit,
            priorityFilter,
            sortDirection,
            sortField,
            statusFilter,
            typeFilter,
        ]
    );

    const logLoadError = useCallback((error: unknown) => {
        logError('[RisksPage] Error fetching risks:', error);
    }, []);

    const collectionWorkflow = useCollectionPageWorkflow<RiskSummary>({
        currentPage,
        fallbackErrorKey: 'errors.load_failed',
        groupBy,
        loadPage: loadRiskPage,
        normalizeItems: normalizeRiskSummaries,
        onLoadError: logLoadError,
    });

    const {
        closeExportDialog,
        fetchCollection: fetchRisks,
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
        resetCollectionGroupAndPage(resetGroupSelection, setCurrentPage);
    }, [resetGroupSelection]);

    useEffect(() => {
        void fetchRisks();
    }, [fetchRisks]);

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

    const handleExport = useCallback(
        async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
            setIsExporting(true);
            try {
                await reportApi.exportRisks({
                    format,
                    asOfDate,
                    filters: buildRiskExportFilters({
                        priorityFilter,
                        search,
                        statusFilter,
                        typeFilter,
                    }),
                });
                closeExportDialog();
            } catch (error) {
                logError('Export failed:', error);
            } finally {
                setIsExporting(false);
            }
        },
        [closeExportDialog, priorityFilter, search, setIsExporting, statusFilter, typeFilter]
    );

    const updateSearch = useCallback((value: string) => {
        setSearch(value);
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const updateStatusFilter = useCallback((value: RiskStatus | '') => {
        setStatusFilter(value);
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const updateTypeFilter = useCallback((value: string) => {
        setTypeFilter(value);
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const togglePriorityFilter = useCallback(() => {
        setPriorityFilter((current) => (current === true ? undefined : true));
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const updateCriticalFilter = useCallback((value: boolean) => {
        setCriticalFilter(value);
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const updateHasBreachFilter = useCallback((value: boolean | undefined) => {
        setHasBreachFilter(value);
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const updateSort = useCallback((nextSortField: string | null, nextSortDirection: SortDirection) => {
        setSortField(nextSortField);
        setSortDirection(nextSortDirection);
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const updateViewMode = useCallback((value: ViewMode) => {
        applyRegisterViewModeChange(value, setViewMode, resetGroupAndPage);
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
        criticalFilter,
        capabilities: collectionWorkflow.capabilities,
        currentPage,
        errorKey: collectionWorkflow.errorKey,
        fetchRisks,
        groups: collectionWorkflow.groups,
        handleExport,
        hasBreachFilter,
        hasLoadedOnce: collectionWorkflow.hasLoadedOnce,
        isExportDialogOpen,
        isExporting,
        isAccessDenied: collectionWorkflow.isAccessDenied,
        isLoading: collectionWorkflow.isLoading,
        items: collectionWorkflow.items,
        limit,
        openExportDialog,
        closeExportDialog,
        priorityFilter,
        restoreRisk,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        sortDirection,
        sortField,
        statusFilter,
        totalCount: collectionWorkflow.totalCount,
        totalPages: getTotalPages(collectionWorkflow.totalCount, limit),
        typeFilter,
        updateCriticalFilter,
        updateHasBreachFilter,
        updateSearch,
        updateSort,
        updateStatusFilter,
        updateTypeFilter,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup,
        togglePriorityFilter,
    };
}
