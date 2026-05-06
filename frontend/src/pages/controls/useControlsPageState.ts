import { useCallback } from 'react';

import type { ViewMode } from '@/components/tables';
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
    useRegisterPageController,
} from '../shared/useRegisterPageController';

type ControlRegisterFilters = {
    statusFilter: ControlListStatusFilter;
};

export function useControlsPageState() {
    const loadControlPage = useCallback(
        ({
            currentPage,
            debouncedSearch,
            filters,
            groupBy,
            groupValue,
            limit,
        }: {
            currentPage: number;
            debouncedSearch: string;
            filters: ControlRegisterFilters;
            groupBy?: string | null;
            groupValue?: string | null;
            limit: number;
        }) => controlApi.getControls(
            buildControlListParams({
                currentPage,
                limit,
                search: debouncedSearch,
                statusFilter: filters.statusFilter,
                groupBy,
                groupValue,
            })
        ),
        []
    );

    const logLoadError = useCallback((error: unknown) => {
        logError('Error fetching controls:', error);
    }, []);

    const submitExport = useCallback(
        async ({
            format,
            asOfDate,
            filters,
            search,
        }: {
            format: string;
            asOfDate?: string | null;
            filters: ControlRegisterFilters;
            search: string;
        }) => {
            await reportApi.exportControls({
                format,
                asOfDate,
                filters: buildControlExportFilters({
                    statusFilter: filters.statusFilter,
                    search,
                }),
            });
        },
        []
    );

    const logExportError = useCallback((error: unknown) => {
        logError('Export failed:', error);
    }, []);

    const registerController = useRegisterPageController<ControlSummary, ControlRegisterFilters, ViewMode>({
        fallbackErrorKey: 'errors.load_failed',
        getGroupBy: getControlGroupBy,
        initialFilters: { statusFilter: '' },
        initialViewMode: 'all',
        loadPage: loadControlPage,
        onExportError: logExportError,
        onLoadError: logLoadError,
        submitExport,
    });
    const {
        closeExportDialog,
        fetchCollection: fetchControls,
        isExportDialogOpen,
        isExporting,
        openExportDialog,
        clearSelectedGroup,
        selectedGroupLabel,
        selectedGroupValue,
        setErrorKey,
        selectGroup,
        updateFilter,
    } = registerController;

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

    const updateStatusFilter = useCallback((value: ControlListStatusFilter) => {
        updateFilter('statusFilter', value);
    }, [updateFilter]);

    return {
        currentPage: registerController.currentPage,
        capabilities: registerController.capabilities,
        errorKey: registerController.errorKey,
        fetchControls,
        groups: registerController.groups,
        handleExport: registerController.handleExport,
        hasLoadedOnce: registerController.hasLoadedOnce,
        isExportDialogOpen,
        isExporting,
        isAccessDenied: registerController.isAccessDenied,
        isLoading: registerController.isLoading,
        items: registerController.items,
        limit: registerController.limit,
        openExportDialog,
        closeExportDialog,
        restoreControl,
        search: registerController.search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage: registerController.setCurrentPage,
        statusFilter: registerController.filters.statusFilter,
        totalCount: registerController.totalCount,
        totalPages: registerController.totalPages,
        updateSearch: registerController.updateSearch,
        updateStatusFilter,
        updateViewMode: registerController.updateViewMode,
        viewMode: registerController.viewMode,
        selectGroup,
        clearSelectedGroup,
    };
}
