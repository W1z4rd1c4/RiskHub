import { useCallback, useRef, useState } from 'react';

import { isForbiddenApiError } from '@/services/apiClient';

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

export function getTotalPages(totalCount: number, limit: number): number {
    return Math.ceil(totalCount / limit) || 1;
}
