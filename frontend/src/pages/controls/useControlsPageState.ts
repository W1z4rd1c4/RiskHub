import { useCallback, useEffect, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { controlApi } from '@/services/controlApi';
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
} from '../shared/collectionPageState';
import {
    type CollectionWorkflowLoadRequest,
    useCollectionPageWorkflow,
} from '../shared/collectionPageWorkflow';
import { resetCollectionGroupAndPage } from '../shared/collectionViewVocabulary';

export function useControlsPageState() {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<ControlListStatusFilter>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);
    const groupBy = getControlGroupBy(viewMode);

    const loadControlPage = useCallback(
        ({ currentPage, groupBy, groupValue }: CollectionWorkflowLoadRequest) => controlApi.getControls(
            buildControlListParams({
                currentPage,
                limit,
                search: debouncedSearch,
                statusFilter,
                groupBy,
                groupValue,
            })
        ),
        [debouncedSearch, limit, statusFilter]
    );

    const logLoadError = useCallback((error: unknown) => {
        logError('Error fetching controls:', error);
    }, []);

    const collectionWorkflow = useCollectionPageWorkflow<ControlSummary>({
        currentPage,
        fallbackErrorKey: 'errors.load_failed',
        groupBy,
        loadPage: loadControlPage,
        onLoadError: logLoadError,
    });
    const {
        closeExportDialog,
        fetchCollection: fetchControls,
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
        capabilities: collectionWorkflow.capabilities,
        errorKey: collectionWorkflow.errorKey,
        fetchControls,
        groups: collectionWorkflow.groups,
        handleExport,
        hasLoadedOnce: collectionWorkflow.hasLoadedOnce,
        isExportDialogOpen,
        isExporting,
        isAccessDenied: collectionWorkflow.isAccessDenied,
        isLoading: collectionWorkflow.isLoading,
        items: collectionWorkflow.items,
        limit,
        openExportDialog,
        closeExportDialog,
        restoreControl,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        statusFilter,
        totalCount: collectionWorkflow.totalCount,
        totalPages: getTotalPages(collectionWorkflow.totalCount, limit),
        updateSearch,
        updateStatusFilter,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup,
    };
}
