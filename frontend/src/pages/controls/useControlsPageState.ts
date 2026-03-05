import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { controlApi } from '@/services/controlApi';
import { reportApi } from '@/services/reportApi';
import { ControlStatus, type ControlSummary } from '@/types/control';

import {
    buildControlExportFilters,
    buildControlListParams,
    fetchAllControlsForGroupedView,
} from './controlsPagePresentation';

export function useControlsPageState() {
    const [items, setItems] = useState<ControlSummary[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<ControlStatus | ''>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [isExporting, setIsExporting] = useState(false);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

    const latestRequestIdRef = useRef(0);
    const hasLoadedControlsRef = useRef(false);

    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);

    const fetchControls = useCallback(async () => {
        const requestId = ++latestRequestIdRef.current;
        try {
            setIsLoading(true);

            if (viewMode === 'all') {
                const response = await controlApi.getControls(
                    buildControlListParams({
                        currentPage,
                        limit,
                        search: debouncedSearch,
                        statusFilter,
                    })
                );
                if (requestId !== latestRequestIdRef.current) {
                    return;
                }
                setItems(response.items);
                setTotalCount(response.total);
            } else {
                const response = await fetchAllControlsForGroupedView({
                    search: debouncedSearch,
                    statusFilter,
                });
                if (requestId !== latestRequestIdRef.current) {
                    return;
                }
                setItems(response.items);
                setTotalCount(response.total);
            }

            setErrorKey(null);
            hasLoadedControlsRef.current = true;
        } catch (error) {
            console.error('Error fetching controls:', error);
            if (requestId === latestRequestIdRef.current) {
                setErrorKey('errors.load_failed');
            }
        } finally {
            if (requestId === latestRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [currentPage, debouncedSearch, limit, statusFilter, viewMode]);

    useEffect(() => {
        void fetchControls();
    }, [fetchControls]);

    const restoreControl = useCallback(
        async (controlId: number) => {
            try {
                await controlApi.restoreControl(controlId);
                await fetchControls();
            } catch (error) {
                console.error('Restore failed:', error);
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
                console.error('Export failed:', error);
            } finally {
                setIsExporting(false);
            }
        },
        [search, statusFilter]
    );

    const updateSearch = useCallback((value: string) => {
        setSearch(value);
        setCurrentPage(1);
    }, []);

    const updateStatusFilter = useCallback((value: ControlStatus | '') => {
        setStatusFilter(value);
        setCurrentPage(1);
    }, []);

    const updateViewMode = useCallback((value: ViewMode) => {
        setViewMode(value);
        setCurrentPage(1);
    }, []);

    return {
        currentPage,
        errorKey,
        fetchControls,
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
        setCurrentPage,
        statusFilter,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
        updateSearch,
        updateStatusFilter,
        updateViewMode,
        viewMode,
    };
}
