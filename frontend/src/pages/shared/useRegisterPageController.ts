import { useCallback, useEffect, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { CollectionListResponse } from '@/types/collection';

import { getTotalPages } from './collectionPageState';
import {
    type CollectionWorkflowLoadRequest,
    useCollectionPageWorkflow,
} from './collectionPageWorkflow';
import { resetCollectionGroupAndPage } from './collectionViewVocabulary';
import { applyRegisterViewModeChange } from './useRegisterPageWorkflow';

interface RegisterPageLoadRequest<TFilters, TViewMode> extends CollectionWorkflowLoadRequest {
    debouncedSearch: string;
    filters: TFilters;
    limit: number;
    viewMode: TViewMode;
}

interface RegisterPageExportRequest<TFilters, TViewMode> extends ExportDialogSubmitPayload {
    debouncedSearch: string;
    filters: TFilters;
    groupBy: string | null;
    search: string;
    selectedGroupValue: string | null;
    viewMode: TViewMode;
}

export interface RegisterFilterPatchRequest<
    TFilters extends Record<string, unknown>,
    TKey extends keyof TFilters = keyof TFilters,
> {
    currentFilters: TFilters;
    key: TKey;
    value: TFilters[TKey];
}

export type RegisterFilterPatchResolver<TFilters extends Record<string, unknown>> = <
    TKey extends keyof TFilters,
>(request: RegisterFilterPatchRequest<TFilters, TKey>) => Partial<TFilters>;

export function resolveRegisterFilterPatch<TFilters extends Record<string, unknown>, TKey extends keyof TFilters>({
    currentFilters,
    key,
    resolveFilterPatch,
    value,
}: RegisterFilterPatchRequest<TFilters, TKey> & {
    resolveFilterPatch?: RegisterFilterPatchResolver<TFilters>;
}): Partial<TFilters> {
    return {
        [key]: value,
        ...resolveFilterPatch?.({ currentFilters, key, value }),
    } as Partial<TFilters>;
}

interface UseRegisterPageControllerOptions<TItem, TFilters extends Record<string, unknown>, TViewMode> {
    fallbackErrorKey: string;
    getGroupBy: (viewMode: TViewMode) => string | null;
    initialFilters: TFilters;
    initialViewMode: TViewMode;
    loadPage: (request: RegisterPageLoadRequest<TFilters, TViewMode>) => Promise<CollectionListResponse<TItem>>;
    onExportError?: (error: unknown) => void;
    onLoadError?: (error: unknown) => void;
    pageSize?: number;
    resolveFilterPatch?: RegisterFilterPatchResolver<TFilters>;
    submitExport: (request: RegisterPageExportRequest<TFilters, TViewMode>) => Promise<void>;
}

export function useRegisterPageController<
    TItem,
    TFilters extends Record<string, unknown>,
    TViewMode extends ViewMode = ViewMode,
>({
    fallbackErrorKey,
    getGroupBy,
    initialFilters,
    initialViewMode,
    loadPage,
    onExportError,
    onLoadError,
    pageSize = DEFAULT_LIST_PAGE_SIZE,
    resolveFilterPatch,
    submitExport,
}: UseRegisterPageControllerOptions<TItem, TFilters, TViewMode>) {
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<TFilters>(initialFilters);
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<TViewMode>(initialViewMode);
    const debouncedSearch = useDebouncedValue(search, 300);
    const groupBy = getGroupBy(viewMode);
    const limit = pageSize;

    const loadRegisterPage = useCallback(
        ({ currentPage, groupBy, groupValue }: CollectionWorkflowLoadRequest) => loadPage({
            currentPage,
            debouncedSearch,
            filters,
            groupBy,
            groupValue,
            limit,
            viewMode,
        }),
        [debouncedSearch, filters, limit, loadPage, viewMode]
    );

    const collectionWorkflow = useCollectionPageWorkflow<TItem>({
        currentPage,
        fallbackErrorKey,
        groupBy,
        loadPage: loadRegisterPage,
        onLoadError,
    });
    const {
        closeExportDialog,
        fetchCollection,
        resetGroupSelection,
        selectGroup: selectCollectionGroup,
        selectedGroupValue,
        setIsExporting,
    } = collectionWorkflow;

    const resetGroupAndPage = useCallback(() => {
        resetCollectionGroupAndPage(resetGroupSelection, setCurrentPage);
    }, [resetGroupSelection]);

    useEffect(() => {
        void fetchCollection();
    }, [fetchCollection]);

    const updateSearch = useCallback((value: string) => {
        setSearch(value);
        resetGroupAndPage();
    }, [resetGroupAndPage]);

    const updateFilter = useCallback(<TKey extends keyof TFilters>(
        key: TKey,
        value: TFilters[TKey],
    ) => {
        setFilters((currentFilters) => ({
            ...currentFilters,
            ...resolveRegisterFilterPatch({
                currentFilters,
                key,
                resolveFilterPatch,
                value,
            }),
        }));
        resetGroupAndPage();
    }, [resetGroupAndPage, resolveFilterPatch]);

    const updateViewMode = useCallback((value: TViewMode) => {
        applyRegisterViewModeChange(value, setViewMode, resetGroupAndPage);
    }, [resetGroupAndPage]);

    const selectGroup = useCallback((groupValue: string, groupLabel: string) => {
        selectCollectionGroup(groupValue, groupLabel);
        setCurrentPage(1);
    }, [selectCollectionGroup]);

    const clearSelectedGroup = useCallback(() => {
        resetGroupSelection();
        setCurrentPage(1);
    }, [resetGroupSelection]);

    const handleExport = useCallback(
        async (payload: ExportDialogSubmitPayload) => {
            setIsExporting(true);
            try {
                await submitExport({
                    ...payload,
                    debouncedSearch,
                    filters,
                    groupBy,
                    search,
                    selectedGroupValue,
                    viewMode,
                });
                closeExportDialog();
            } catch (error) {
                onExportError?.(error);
            } finally {
                setIsExporting(false);
            }
        },
        [
            closeExportDialog,
            debouncedSearch,
            filters,
            groupBy,
            onExportError,
            search,
            selectedGroupValue,
            setIsExporting,
            submitExport,
            viewMode,
        ]
    );

    return {
        ...collectionWorkflow,
        clearSelectedGroup,
        currentPage,
        debouncedSearch,
        fetchCollection,
        filters,
        handleExport,
        limit,
        search,
        selectGroup,
        setCurrentPage,
        totalPages: getTotalPages(collectionWorkflow.totalCount, limit),
        updateFilter,
        updateSearch,
        updateViewMode,
        viewMode,
    };
}
