import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { SortDirection, ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { loadCollectionPage } from '@/services/collectionApi';
import { logError } from '@/services/logger';
import { reportApi } from '@/services/reportApi';
import { riskApi } from '@/services/riskApi';
import type { CollectionGroup } from '@/types/collection';
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
    useCollectionGroupSelection,
    useExportDialogState,
    useLatestRequestGuard,
} from '../shared/collectionPageState';

interface UseRisksPageStateOptions {
    initialState: RisksPageInitialState;
}

export function useRisksPageState({ initialState }: UseRisksPageStateOptions) {
    const [items, setItems] = useState<RiskSummary[]>([]);
    const [groups, setGroups] = useState<CollectionGroup[]>([]);
    const [capabilities, setCapabilities] = useState<Record<string, boolean> | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
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
    const hasLoadedRisksRef = useRef(false);

    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);
    const groupBy = getRiskGroupBy(viewMode);

    const resetGroupAndPage = useCallback(() => {
        resetGroupSelection();
        setCurrentPage(1);
    }, [resetGroupSelection]);

    const fetchRisks = useCallback(async () => {
        const requestId = beginRequest();
        try {
            setIsLoading(true);

            const response = await loadCollectionPage({
                currentPage,
                groupBy,
                selectedGroupValue,
                normalizeItems: normalizeRiskSummaries,
                loadPage: ({ currentPage, groupBy, groupValue }) => riskApi.getRisks(
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
            });
            if (!isCurrentRequest(requestId)) {
                return;
            }
            setItems(response.items);
            setGroups(response.groups);
            setCapabilities(response.capabilities);
            setTotalCount(response.total);

            setErrorKey(null);
            hasLoadedRisksRef.current = true;
        } catch (error) {
            logError('[RisksPage] Error fetching risks:', error);
            if (isCurrentRequest(requestId)) {
                setErrorKey('errors.load_failed');
            }
        } finally {
            if (isCurrentRequest(requestId)) {
                setIsLoading(false);
            }
        }
    }, [
        beginRequest,
        currentPage,
        criticalFilter,
        debouncedSearch,
        groupBy,
        hasBreachFilter,
        isCurrentRequest,
        limit,
        priorityFilter,
        selectedGroupValue,
        sortDirection,
        sortField,
        statusFilter,
        typeFilter,
    ]);

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
        [fetchRisks]
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
        criticalFilter,
        capabilities,
        currentPage,
        errorKey,
        fetchRisks,
        groups,
        handleExport,
        hasBreachFilter,
        hasLoadedOnce: hasLoadedRisksRef.current,
        isExportDialogOpen,
        isExporting,
        isLoading,
        items,
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
        totalCount,
        totalPages: getTotalPages(totalCount, limit),
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
