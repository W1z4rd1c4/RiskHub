import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE, LIST_SEARCH_DEBOUNCE_MS } from '@/constants/list';
import { KRI_MONITORING_FILTER_VALUES } from '@/lib/monitoringStatus';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { apiClient } from '@/services/apiClient';
import { loadCollectionPage } from '@/services/collectionApi';
import { kriApi } from '@/services/kriApi';
import { reportApi } from '@/services/reportApi';
import type { CollectionGroup } from '@/types/collection';
import type { KeyRiskIndicator } from '@/types/kri';

import {
    ARCHIVED_ROUTE_VALUE,
    ARCHIVED_STATUS_PARAM,
    buildKriExportFilters,
    buildKriListParams,
    getKriGroupBy,
    readKriRouteFilters,
    type KriStatusFilter,
    type KriTimelinessFilter,
} from './kriPagePresentation';
import { resolveCollectionLoadFailure } from '../shared/collectionPageState';

const TIMELINESS_FILTER_VALUES = ['due_soon'] as const;

interface UseKrisPageStateOptions {
    searchParams: URLSearchParams;
    setSearchParams: (nextParams: URLSearchParams, options?: { replace?: boolean }) => void;
}

export function useKrisPageState({ searchParams, setSearchParams }: UseKrisPageStateOptions) {
    const [items, setItems] = useState<KeyRiskIndicator[]>([]);
    const [groups, setGroups] = useState<CollectionGroup[]>([]);
    const [capabilities, setCapabilities] = useState<Record<string, boolean> | null>(null);
    const [selectedGroupValue, setSelectedGroupValue] = useState<string | null>(null);
    const [selectedGroupLabel, setSelectedGroupLabel] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const latestRequestIdRef = useRef(0);
    const hasLoadedKrisRef = useRef(false);

    const { statusFilter, timelinessFilter } = readKriRouteFilters(
        searchParams,
        KRI_MONITORING_FILTER_VALUES,
        TIMELINESS_FILTER_VALUES
    );
    const debouncedSearch = useDebouncedValue(search, LIST_SEARCH_DEBOUNCE_MS);
    const limit = DEFAULT_LIST_PAGE_SIZE;
    const groupBy = getKriGroupBy(viewMode);

    const fetchKris = useCallback(async () => {
        const requestId = ++latestRequestIdRef.current;
        try {
            setIsLoading(true);

            const response = await loadCollectionPage({
                currentPage,
                groupBy,
                selectedGroupValue,
                loadPage: ({ currentPage, groupBy, groupValue }) => kriApi.getKRIs(
                    buildKriListParams({
                        currentPage,
                        limit,
                        search: debouncedSearch,
                        statusFilter,
                        timelinessFilter,
                        groupBy,
                        groupValue,
                    })
                ),
            });
            if (requestId !== latestRequestIdRef.current) {
                return;
            }
            setItems(response.items);
            setGroups(response.groups);
            setCapabilities(response.capabilities);
            setTotalCount(response.total);

            setErrorKey(null);
            setIsAccessDenied(false);
            hasLoadedKrisRef.current = true;
        } catch (error) {
            if (requestId !== latestRequestIdRef.current) {
                return;
            }
            const failure = resolveCollectionLoadFailure(error, {
                clearOnNonForbidden: true,
                toErrorKey: apiClient.toUiMessageKey,
            });
            setIsAccessDenied(failure.isAccessDenied);
            setErrorKey(failure.errorKey);
            if (failure.shouldClearCollection) {
                setItems([]);
                setGroups([]);
                setCapabilities(null);
                setTotalCount(0);
            }
            if (failure.shouldMarkUnloaded) {
                hasLoadedKrisRef.current = false;
            }
        } finally {
            if (requestId === latestRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [currentPage, debouncedSearch, groupBy, limit, selectedGroupValue, statusFilter, timelinessFilter]);

    useEffect(() => {
        void fetchKris();
    }, [fetchKris]);

    const updateRouteFilters = useCallback((nextStatusFilter: KriStatusFilter, nextTimelinessFilter: KriTimelinessFilter) => {
        setCurrentPage(1);
        setSelectedGroupValue(null);
        setSelectedGroupLabel(null);

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('monitoring_status');
        nextParams.delete('timeliness_status');
        nextParams.delete(ARCHIVED_STATUS_PARAM);

        if (nextTimelinessFilter) {
            nextParams.set('timeliness_status', nextTimelinessFilter);
        } else if (nextStatusFilter === 'archived') {
            nextParams.set(ARCHIVED_STATUS_PARAM, ARCHIVED_ROUTE_VALUE);
        } else if (nextStatusFilter !== 'all') {
            nextParams.set('monitoring_status', nextStatusFilter);
        }

        setSearchParams(nextParams, { replace: true });
    }, [searchParams, setSearchParams]);

    const updateViewMode = useCallback((nextViewMode: ViewMode) => {
        setViewMode(nextViewMode);
        setCurrentPage(1);
        setSelectedGroupValue(null);
        setSelectedGroupLabel(null);
    }, []);

    const updateSearch = useCallback((value: string) => {
        setSearch(value);
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

    const restoreKri = useCallback(async (kriId: number) => {
        try {
            await kriApi.restoreKRI(kriId);
            await fetchKris();
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        }
    }, [fetchKris]);

    const handleExport = useCallback(async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
        setIsExporting(true);
        try {
            await reportApi.exportKRIs({
                format,
                asOfDate,
                filters: buildKriExportFilters({
                    search,
                    statusFilter,
                    timelinessFilter,
                }),
            });
            setIsExportDialogOpen(false);
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setIsExporting(false);
        }
    }, [search, statusFilter, timelinessFilter]);

    return {
        currentPage,
        capabilities,
        errorKey,
        fetchKris,
        groups,
        handleExport,
        hasLoadedOnce: hasLoadedKrisRef.current,
        isExportDialogOpen,
        isExporting,
        isAccessDenied,
        isLoading,
        items,
        limit,
        openExportDialog: () => setIsExportDialogOpen(true),
        closeExportDialog: () => setIsExportDialogOpen(false),
        restoreKri,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        statusFilter,
        timelinessFilter,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
        updateRouteFilters,
        updateSearch,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup,
    };
}
