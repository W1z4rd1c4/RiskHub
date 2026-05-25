import { useCallback, useEffect, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import type { ViewMode } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { CollectionCapabilities, CollectionListResponse } from '@/types/collection';

import { getTotalPages } from './collectionPageState';
import {
    type CollectionWorkflowLoadRequest,
    useCollectionPageWorkflow,
} from './collectionPageWorkflow';
import { resetCollectionGroupAndPage } from './collectionViewVocabulary';
import { applyRegisterViewModeChange } from './useRegisterPageWorkflow';

export interface RegisterPageLoadRequest<TFilters, TViewMode> extends CollectionWorkflowLoadRequest {
    debouncedSearch: string;
    filters: TFilters;
    limit: number;
    viewMode: TViewMode;
}

export interface RegisterPageExportRequest<TFilters, TViewMode> extends ExportDialogSubmitPayload {
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

interface UseRegisterPageControllerOptions<
    TItem,
    TFilters extends Record<string, unknown>,
    TViewMode,
    TCapabilities extends object,
> {
    fallbackErrorKey: string;
    clearOnNonForbidden?: boolean;
    getGroupBy: (viewMode: TViewMode) => string | null;
    initialFilters: TFilters;
    initialViewMode: TViewMode;
    loadPage: (
        request: RegisterPageLoadRequest<TFilters, TViewMode>
    ) => Promise<CollectionListResponse<TItem, TCapabilities>>;
    onExportError?: (error: unknown) => void;
    onLoadError?: (error: unknown) => void;
    pageSize?: number;
    searchDebounceMs?: number;
    normalizeItems?: (items: TItem[]) => TItem[];
    resolveFilterPatch?: RegisterFilterPatchResolver<TFilters>;
    submitExport: (request: RegisterPageExportRequest<TFilters, TViewMode>) => Promise<void>;
    toErrorKey?: (error: unknown) => string;
    toExportErrorKey?: (error: unknown) => string;
}

export function useRegisterPageController<
    TItem,
    TFilters extends Record<string, unknown>,
    TViewMode extends ViewMode = ViewMode,
    TCapabilities extends object = CollectionCapabilities,
>({
    fallbackErrorKey,
    clearOnNonForbidden,
    getGroupBy,
    initialFilters,
    initialViewMode,
    loadPage,
    onExportError,
    onLoadError,
    pageSize = DEFAULT_LIST_PAGE_SIZE,
    searchDebounceMs = 300,
    normalizeItems,
    resolveFilterPatch,
    submitExport,
    toErrorKey,
    toExportErrorKey,
}: UseRegisterPageControllerOptions<TItem, TFilters, TViewMode, TCapabilities>) {
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<TFilters>(initialFilters);
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<TViewMode>(initialViewMode);
    const debouncedSearch = useDebouncedValue(search, searchDebounceMs);
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

    const collectionWorkflow = useCollectionPageWorkflow<TItem, TCapabilities>({
        clearOnNonForbidden,
        currentPage,
        fallbackErrorKey,
        groupBy,
        loadPage: loadRegisterPage,
        normalizeItems,
        onLoadError,
        toErrorKey,
    });
    const {
        closeExportDialog,
        fetchCollection,
        resetGroupSelection,
        selectGroup: selectCollectionGroup,
        selectedGroupValue,
        setErrorKey,
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

    const updateFilters = useCallback((patch: Partial<TFilters>) => {
        setFilters((currentFilters) => ({
            ...currentFilters,
            ...patch,
        }));
        resetGroupAndPage();
    }, [resetGroupAndPage]);

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
                if (toExportErrorKey) {
                    setErrorKey(toExportErrorKey(error));
                }
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
            setErrorKey,
            setIsExporting,
            submitExport,
            toExportErrorKey,
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
        updateFilters,
        updateSearch,
        updateViewMode,
        viewMode,
    };
}
