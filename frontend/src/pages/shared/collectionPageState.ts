import { useCallback, useRef, useState } from 'react';

import { isForbiddenApiError } from '@/services/apiClient';
import type { CollectionCapabilities, CollectionGroup } from '@/types/collection';

export interface CollectionLoadFailureOptions {
    clearOnNonForbidden?: boolean;
    fallbackErrorKey?: string;
    toErrorKey?: (error: unknown) => string | null;
}

interface CollectionLoadFailureResolution {
    errorKey: string | null;
    isAccessDenied: boolean;
    shouldClearCollection: boolean;
    shouldMarkUnloaded: boolean;
}

interface CollectionSuccessPayload<TItem, TCapabilities extends object> {
    items: TItem[];
    groups: CollectionGroup[];
    capabilities: TCapabilities | null;
    total: number;
}

export interface CollectionStatePatch<TItem, TCapabilities extends object = CollectionCapabilities> {
    items?: TItem[];
    groups?: CollectionGroup[];
    capabilities?: TCapabilities | null;
    totalCount?: number;
    errorKey: string | null;
    isAccessDenied: boolean;
    hasLoadedOnce?: boolean;
}

export interface CollectionStateSnapshot<TItem, TCapabilities extends object = CollectionCapabilities> {
    items: TItem[];
    groups: CollectionGroup[];
    capabilities: TCapabilities | null;
    totalCount: number;
    errorKey: string | null;
    isAccessDenied: boolean;
    hasLoadedOnce: boolean;
}

export function createCollectionInitialState<
    TItem,
    TCapabilities extends object = CollectionCapabilities,
>(): CollectionStateSnapshot<TItem, TCapabilities> {
    return {
        items: [],
        groups: [],
        capabilities: null,
        totalCount: 0,
        errorKey: null,
        isAccessDenied: false,
        hasLoadedOnce: false,
    };
}

export function applyCollectionStatePatch<TItem>(
    state: CollectionStateSnapshot<TItem>,
    patch: CollectionStatePatch<TItem>
): CollectionStateSnapshot<TItem>;
export function applyCollectionStatePatch<TItem, TCapabilities extends object>(
    state: CollectionStateSnapshot<TItem, TCapabilities>,
    patch: CollectionStatePatch<TItem, TCapabilities>
): CollectionStateSnapshot<TItem, TCapabilities>;
export function applyCollectionStatePatch<TItem, TCapabilities extends object = CollectionCapabilities>(
    state: CollectionStateSnapshot<TItem, TCapabilities>,
    patch: CollectionStatePatch<TItem, TCapabilities>
): CollectionStateSnapshot<TItem, TCapabilities> {
    return {
        items: patch.items ?? state.items,
        groups: patch.groups ?? state.groups,
        capabilities: patch.capabilities === undefined ? state.capabilities : patch.capabilities,
        totalCount: patch.totalCount ?? state.totalCount,
        errorKey: patch.errorKey,
        isAccessDenied: patch.isAccessDenied,
        hasLoadedOnce: patch.hasLoadedOnce ?? state.hasLoadedOnce,
    };
}

export function resolveCollectionLoadFailure(
    error: unknown,
    options: CollectionLoadFailureOptions = {}
): CollectionLoadFailureResolution {
    const isAccessDenied = isForbiddenApiError(error);
    return {
        errorKey: isAccessDenied
            ? null
            : options.toErrorKey?.(error) ?? options.fallbackErrorKey ?? null,
        isAccessDenied,
        shouldClearCollection: isAccessDenied || options.clearOnNonForbidden === true,
        shouldMarkUnloaded: isAccessDenied,
    };
}

export function createCollectionSuccessPatch<TItem, TCapabilities extends object = CollectionCapabilities>(
    payload: CollectionSuccessPayload<TItem, TCapabilities>
): CollectionStatePatch<TItem, TCapabilities> {
    return {
        items: payload.items,
        groups: payload.groups,
        capabilities: payload.capabilities,
        totalCount: payload.total,
        errorKey: null,
        isAccessDenied: false,
        hasLoadedOnce: true,
    };
}

export function createCollectionFailurePatch<
    TItem = unknown,
    TCapabilities extends object = CollectionCapabilities,
>(
    error: unknown,
    options: CollectionLoadFailureOptions = {}
): CollectionStatePatch<TItem, TCapabilities> {
    const failure = resolveCollectionLoadFailure(error, options);
    const patch: CollectionStatePatch<TItem, TCapabilities> = {
        errorKey: failure.errorKey,
        isAccessDenied: failure.isAccessDenied,
    };
    if (failure.shouldClearCollection) {
        patch.items = [];
        patch.groups = [];
        patch.capabilities = null;
        patch.totalCount = 0;
    }
    if (failure.shouldMarkUnloaded) {
        patch.hasLoadedOnce = false;
    }
    return patch;
}

export function useLatestRequestGuard() {
    const latestRequestIdRef = useRef(0);

    const beginRequest = useCallback(() => {
        latestRequestIdRef.current += 1;
        return latestRequestIdRef.current;
    }, []);

    const isCurrentRequest = useCallback((requestId: number) => {
        return requestId === latestRequestIdRef.current;
    }, []);

    return { beginRequest, isCurrentRequest };
}

export function useCollectionGroupSelection() {
    const [selectedGroupValue, setSelectedGroupValue] = useState<string | null>(null);
    const [selectedGroupLabel, setSelectedGroupLabel] = useState<string | null>(null);

    const resetGroupSelection = useCallback(() => {
        setSelectedGroupValue(null);
        setSelectedGroupLabel(null);
    }, []);

    const selectGroup = useCallback((groupValue: string, groupLabel: string) => {
        setSelectedGroupValue(groupValue);
        setSelectedGroupLabel(groupLabel);
    }, []);

    return {
        resetGroupSelection,
        selectGroup,
        selectedGroupLabel,
        selectedGroupValue,
    };
}

export function useExportDialogState() {
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const closeExportDialog = useCallback(() => setIsExportDialogOpen(false), []);
    const openExportDialog = useCallback(() => setIsExportDialogOpen(true), []);

    return {
        closeExportDialog,
        isExportDialogOpen,
        isExporting,
        openExportDialog,
        setIsExporting,
    };
}

export function useCollectionDataState<
    TItem,
    TCapabilities extends object = CollectionCapabilities,
>() {
    const [state, setState] = useState<CollectionStateSnapshot<TItem, TCapabilities>>(
        createCollectionInitialState<TItem, TCapabilities>
    );
    const [isLoading, setIsLoading] = useState(true);

    const applyPatch = useCallback((patch: CollectionStatePatch<TItem, TCapabilities>) => {
        setState((currentState) => applyCollectionStatePatch(currentState, patch));
    }, []);

    const applySuccess = useCallback((payload: CollectionSuccessPayload<TItem, TCapabilities>) => {
        applyPatch(createCollectionSuccessPatch(payload));
    }, [applyPatch]);

    const applyFailure = useCallback((
        error: unknown,
        options: CollectionLoadFailureOptions = {}
    ) => {
        const patch = createCollectionFailurePatch<TItem, TCapabilities>(error, options);
        applyPatch(patch);
        return patch;
    }, [applyPatch]);

    const setErrorKey = useCallback((errorKey: string | null) => {
        setState((currentState) => ({
            ...currentState,
            errorKey,
        }));
    }, []);

    return {
        ...state,
        applyFailure,
        applyPatch,
        applySuccess,
        isLoading,
        setErrorKey,
        setIsLoading,
    };
}

export function useCollectionPageController() {
    return {
        ...useLatestRequestGuard(),
        ...useCollectionGroupSelection(),
        ...useExportDialogState(),
    };
}

export function getTotalPages(totalCount: number, limit: number): number {
    return Math.ceil(totalCount / limit) || 1;
}
