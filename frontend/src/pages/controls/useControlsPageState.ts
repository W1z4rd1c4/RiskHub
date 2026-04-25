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

export function useControlsPageState() {
    const [items, setItems] = useState<ControlSummary[]>([]);
    const [groups, setGroups] = useState<CollectionGroup[]>([]);
    const [selectedGroupValue, setSelectedGroupValue] = useState<string | null>(null);
    const [selectedGroupLabel, setSelectedGroupLabel] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<ControlListStatusFilter>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [isExporting, setIsExporting] = useState(false);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

    const latestRequestIdRef = useRef(0);
    const hasLoadedControlsRef = useRef(false);

    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);
    const groupBy = getControlGroupBy(viewMode);

    const fetchControls = useCallback(async () => {
        const requestId = ++latestRequestIdRef.current;
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
            if (requestId !== latestRequestIdRef.current) {
                return;
            }
            setItems(response.items);
            setGroups(response.groups);
            setTotalCount(response.total);

            setErrorKey(null);
            hasLoadedControlsRef.current = true;
        } catch (error) {
            logError('Error fetching controls:', error);
            if (requestId === latestRequestIdRef.current) {
                setErrorKey('errors.load_failed');
            }
        } finally {
            if (requestId === latestRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [currentPage, debouncedSearch, groupBy, limit, selectedGroupValue, statusFilter]);

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
                setIsExportDialogOpen(false);
            } catch (error) {
                logError('Export failed:', error);
            } finally {
                setIsExporting(false);
            }
        },
        [search, statusFilter]
    );

    const updateSearch = useCallback((value: string) => {
        setSearch(value);
        setCurrentPage(1);
        setSelectedGroupValue(null);
        setSelectedGroupLabel(null);
    }, []);

    const updateStatusFilter = useCallback((value: ControlListStatusFilter) => {
        setStatusFilter(value);
        setCurrentPage(1);
        setSelectedGroupValue(null);
        setSelectedGroupLabel(null);
    }, []);

    const updateViewMode = useCallback((value: ViewMode) => {
        setViewMode(value);
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

    return {
        currentPage,
        errorKey,
        fetchControls,
        groups,
        handleExport,
        hasLoadedOnce: hasLoadedControlsRef.current,
        isExportDialogOpen,
        isExporting,
        isLoading,
        items,
        limit,
        openExportDialog: () => setIsExportDialogOpen(true),
        closeExportDialog: () => setIsExportDialogOpen(false),
        restoreControl,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        statusFilter,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
        updateSearch,
        updateStatusFilter,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup,
    };
}
