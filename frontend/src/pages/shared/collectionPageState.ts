import { useCallback, useRef, useState } from 'react';

import { isForbiddenApiError } from '@/services/apiClient';
import type { CollectionGroup } from '@/types/collection';

interface CollectionLoadFailureOptions {
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

interface CollectionSuccessPayload<TItem> {
    items: TItem[];
    groups: CollectionGroup[];
    capabilities: Record<string, boolean> | null;
    total: number;
}

interface CollectionStatePatch<TItem> {
    items?: TItem[];
    groups?: CollectionGroup[];
    capabilities?: Record<string, boolean> | null;
    totalCount?: number;
    errorKey: string | null;
    isAccessDenied: boolean;
    hasLoadedOnce?: boolean;
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

export function createCollectionSuccessPatch<TItem>(
    payload: CollectionSuccessPayload<TItem>
): CollectionStatePatch<TItem> {
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

export function createCollectionFailurePatch<TItem = unknown>(
    error: unknown,
    options: CollectionLoadFailureOptions = {}
): CollectionStatePatch<TItem> {
    const failure = resolveCollectionLoadFailure(error, options);
    const patch: CollectionStatePatch<TItem> = {
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
