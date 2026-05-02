import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { controlApi } from '@/services/controlApi';
import { loadCollectionPage } from '@/services/collectionApi';
import { logError } from '@/services/logger';
import { reportApi } from '@/services/reportApi';
import type { CollectionGroup } from '@/types/collection';
import type { ControlSummary } from '@/types/control';

import {
    buildControlExportFilters,
    buildControlListParams,
    type ControlListStatusFilter,
    getControlGroupBy,
} from './controlsPagePresentation';
import {
    getTotalPages,
    resolveCollectionLoadFailure,
    useCollectionGroupSelection,
    useExportDialogState,
    useLatestRequestGuard,
} from '../shared/collectionPageState';

export function useControlsPageState() {
    const [items, setItems] = useState<ControlSummary[]>([]);
    const [groups, setGroups] = useState<CollectionGroup[]>([]);
    const [capabilities, setCapabilities] = useState<Record<string, boolean> | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<ControlListStatusFilter>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
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
    const hasLoadedControlsRef = useRef(false);

    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);
    const groupBy = getControlGroupBy(viewMode);

    const resetGroupAndPage = useCallback(() => {
        resetGroupSelection();
        setCurrentPage(1);
    }, [resetGroupSelection]);

    const fetchControls = useCallback(async () => {
        const requestId = beginRequest();
        try {
            setIsLoading(true);

            const response = await loadCollectionPage({
                currentPage,
                groupBy,
                selectedGroupValue,
                loadPage: ({ currentPage, groupBy, groupValue }) => controlApi.getControls(
                    buildControlListParams({
                        currentPage,
                        limit,
                        search: debouncedSearch,
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
            setCapabilities(response.capabilities);
            setTotalCount(response.total);

            setErrorKey(null);
            setIsAccessDenied(false);
            hasLoadedControlsRef.current = true;
        } catch (error) {
            logError('Error fetching controls:', error);
            if (isCurrentRequest(requestId)) {
                const failure = resolveCollectionLoadFailure(error, {
                    fallbackErrorKey: 'errors.load_failed',
                });
                setIsAccessDenied(failure.isAccessDenied);
                if (failure.shouldClearCollection) {
                    setItems([]);
                    setGroups([]);
                    setCapabilities(null);
                    setTotalCount(0);
                }
                if (failure.shouldMarkUnloaded) {
                    hasLoadedControlsRef.current = false;
                }
                setErrorKey(failure.errorKey);
            }
        } finally {
            if (isCurrentRequest(requestId)) {
                setIsLoading(false);
            }
        }
    }, [beginRequest, currentPage, debouncedSearch, groupBy, isCurrentRequest, limit, selectedGroupValue, statusFilter]);

    useEffect(() => {
        void fetchControls();
    }, [fetchControls]);

    const restoreControl = useCallback(
        async (controlId: number) => {
            try {
                await controlApi.restoreControl(controlId);
                await fetchControls();
            } catch (error) {
                logError('Restore failed:', error);
                setErrorKey('errors.load_failed');
            }
        },
        [fetchControls]
    );

    const handleExport = useCallback(
        async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
            setIsExporting(true);
            try {
                await reportApi.exportControls({
                    format,
                    asOfDate,
                    filters: buildControlExportFilters({
                        statusFilter,
                        search,
                    }),
                });
                closeExportDialog();
            } catch (error) {
                logError('Export failed:', error);
            } finally {
                setIsExporting(false);
            }
        },
        [closeExportDialog, search, setIsExporting, statusFilter]
    );

    const updateSearch = useCallback((value: string) => {
        setSearch(value);
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const updateStatusFilter = useCallback((value: ControlListStatusFilter) => {
        setStatusFilter(value);
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
        currentPage,
        capabilities,
        errorKey,
        fetchControls,
        groups,
        handleExport,
        hasLoadedOnce: hasLoadedControlsRef.current,
        isExportDialogOpen,
        isExporting,
        isAccessDenied,
        isLoading,
        items,
        limit,
        openExportDialog,
        closeExportDialog,
        restoreControl,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        statusFilter,
        totalCount,
        totalPages: getTotalPages(totalCount, limit),
        updateSearch,
        updateStatusFilter,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup,
    };
}
