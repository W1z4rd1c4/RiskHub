import { useCallback, useEffect, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { controlApi } from '@/services/controlApi';
import { loadCollectionPage } from '@/services/collectionApi';
import { logError } from '@/services/logger';
import { reportApi } from '@/services/reportApi';
import type { ControlSummary } from '@/types/control';

import {
    buildControlExportFilters,
    buildControlListParams,
    type ControlListStatusFilter,
    getControlGroupBy,
} from './controlsPagePresentation';
import {
    getTotalPages,
    useCollectionDataState,
    useCollectionPageController,
} from '../shared/collectionPageState';

export function useControlsPageState() {
    const collectionData = useCollectionDataState<ControlSummary>();
    const {
        applyFailure,
        applySuccess,
        setErrorKey,
        setIsLoading,
    } = collectionData;
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<ControlListStatusFilter>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
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
            applySuccess(response);
        } catch (error) {
            logError('Error fetching controls:', error);
            if (isCurrentRequest(requestId)) {
                applyFailure(error, {
                    fallbackErrorKey: 'errors.load_failed',
                });
            }
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
        groupBy,
        isCurrentRequest,
        limit,
        selectedGroupValue,
        setIsLoading,
        statusFilter,
    ]);

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
        [fetchControls, setErrorKey]
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
        capabilities: collectionData.capabilities,
        errorKey: collectionData.errorKey,
        fetchControls,
        groups: collectionData.groups,
        handleExport,
        hasLoadedOnce: collectionData.hasLoadedOnce,
        isExportDialogOpen,
        isExporting,
        isAccessDenied: collectionData.isAccessDenied,
        isLoading: collectionData.isLoading,
        items: collectionData.items,
        limit,
        openExportDialog,
        closeExportDialog,
        restoreControl,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        statusFilter,
        totalCount: collectionData.totalCount,
        totalPages: getTotalPages(collectionData.totalCount, limit),
        updateSearch,
        updateStatusFilter,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup,
    };
}
