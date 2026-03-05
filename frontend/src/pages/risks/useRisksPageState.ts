import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { SortDirection, ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { reportApi } from '@/services/reportApi';
import { riskApi } from '@/services/riskApi';
import type { RiskStatus, RiskSummary } from '@/types/risk';

import {
    buildRiskExportFilters,
    buildRiskListParams,
    fetchAllRisksForGroupedView,
    normalizeRiskSummaries,
    type RisksPageInitialState,
} from './risksPagePresentation';

interface UseRisksPageStateOptions {
    initialState: RisksPageInitialState;
}

export function useRisksPageState({ initialState }: UseRisksPageStateOptions) {
    const [items, setItems] = useState<RiskSummary[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<RiskStatus | ''>('active');
    const [typeFilter, setTypeFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState<boolean | undefined>(undefined);
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [isExporting, setIsExporting] = useState(false);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [hasBreachFilter, setHasBreachFilter] = useState<boolean | undefined>(
        initialState.hasBreachFilter
    );
    const [criticalFilter, setCriticalFilter] = useState(initialState.criticalFilter);
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);

    const latestRequestIdRef = useRef(0);
    const hasLoadedRisksRef = useRef(false);

    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);

    const fetchRisks = useCallback(async () => {
        const requestId = ++latestRequestIdRef.current;
        try {
            setIsLoading(true);

            if (viewMode === 'all') {
                const response = await riskApi.getRisks(
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
                    })
                );
                if (requestId !== latestRequestIdRef.current) {
                    return;
                }
                setItems(normalizeRiskSummaries(response.items));
                setTotalCount(response.total);
            } else {
                const response = await fetchAllRisksForGroupedView({
                    criticalFilter,
                    hasBreachFilter,
                    priorityFilter,
                    search: debouncedSearch,
                    sortDirection,
                    sortField,
                    statusFilter,
                    typeFilter,
                });
                if (requestId !== latestRequestIdRef.current) {
                    return;
                }
                setItems(response.items);
                setTotalCount(response.total);
            }

            setErrorKey(null);
            hasLoadedRisksRef.current = true;
        } catch (error) {
            console.error('[RisksPage] Error fetching risks:', error);
            if (requestId === latestRequestIdRef.current) {
                setErrorKey('errors.load_failed');
            }
        } finally {
            if (requestId === latestRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [
        currentPage,
        criticalFilter,
        debouncedSearch,
        hasBreachFilter,
        limit,
        priorityFilter,
        sortDirection,
        sortField,
        statusFilter,
        typeFilter,
        viewMode,
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
                console.error('Failed to restore risk:', error);
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
                setIsExportDialogOpen(false);
            } catch (error) {
                console.error('Export failed:', error);
            } finally {
                setIsExporting(false);
            }
        },
        [priorityFilter, search, statusFilter, typeFilter]
    );

    const updateSearch = useCallback((value: string) => {
        setSearch(value);
        setCurrentPage(1);
    }, []);

    const updateStatusFilter = useCallback((value: RiskStatus | '') => {
        setStatusFilter(value);
        setCurrentPage(1);
    }, []);

    const updateTypeFilter = useCallback((value: string) => {
        setTypeFilter(value);
        setCurrentPage(1);
    }, []);

    const togglePriorityFilter = useCallback(() => {
        setPriorityFilter((current) => (current === true ? undefined : true));
        setCurrentPage(1);
    }, []);

    const updateCriticalFilter = useCallback((value: boolean) => {
        setCriticalFilter(value);
        setCurrentPage(1);
    }, []);

    const updateHasBreachFilter = useCallback((value: boolean | undefined) => {
        setHasBreachFilter(value);
        setCurrentPage(1);
    }, []);

    const updateSort = useCallback((nextSortField: string | null, nextSortDirection: SortDirection) => {
        setSortField(nextSortField);
        setSortDirection(nextSortDirection);
        setCurrentPage(1);
    }, []);

    const updateViewMode = useCallback((value: ViewMode) => {
        setViewMode(value);
        setCurrentPage(1);
    }, []);

    return {
        criticalFilter,
        currentPage,
        errorKey,
        fetchRisks,
        handleExport,
        hasBreachFilter,
        hasLoadedOnce: hasLoadedRisksRef.current,
        isExportDialogOpen,
        isExporting,
        isLoading,
        items,
        limit,
        openExportDialog: () => setIsExportDialogOpen(true),
        closeExportDialog: () => setIsExportDialogOpen(false),
        priorityFilter,
        restoreRisk,
        search,
        setCurrentPage,
        sortDirection,
        sortField,
        statusFilter,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
        typeFilter,
        updateCriticalFilter,
        updateHasBreachFilter,
        updateSearch,
        updateSort,
        updateStatusFilter,
        updateTypeFilter,
        updateViewMode,
        viewMode,
        togglePriorityFilter,
    };
}
