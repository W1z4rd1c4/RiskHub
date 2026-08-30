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

interface ApplyCollectionSuccess<TItem, TCapabilities extends object> {
    (payload: CollectionSuccessPayload<TItem, TCapabilities>): void;
    (queryIdentity: string, payload: CollectionSuccessPayload<TItem, TCapabilities>): void;
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

export type CollectionOutcome =
    | { kind: 'initial-loading' }
    | {
        kind: 'content' | 'empty';
        isRefreshing: boolean;
    }
    | {
        kind: 'stale-with-error';
        errorKey: string;
        isRetrying: boolean;
    }
    | { kind: 'fatal-error'; errorKey: string; isRetrying: boolean }
    | { kind: 'denied' };

export function resolveCollectionOutcome<
    TItem,
    TCapabilities extends object = CollectionCapabilities,
>(
    state: CollectionStateSnapshot<TItem, TCapabilities>,
    isLoading: boolean,
): CollectionOutcome {
    if (state.isAccessDenied) {
        return { kind: 'denied' };
    }

    if (state.errorKey) {
        return state.hasLoadedOnce
            ? {
                kind: 'stale-with-error',
                errorKey: state.errorKey,
                isRetrying: isLoading,
            }
            : {
                kind: 'fatal-error',
                errorKey: state.errorKey,
                isRetrying: isLoading,
            };
    }

    if (!state.hasLoadedOnce) {
        return { kind: 'initial-loading' };
    }

    return {
        kind: state.items.length > 0 || state.groups.length > 0 ? 'content' : 'empty',
        isRefreshing: isLoading,
    };
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

export function useCollectionDataState<
    TItem,
    TCapabilities extends object = CollectionCapabilities,
>() {
    const [state, setState] = useState<CollectionStateSnapshot<TItem, TCapabilities>>(
        createCollectionInitialState<TItem, TCapabilities>
    );
    const [isLoading, setIsLoading] = useState(true);
    const committedQueryIdentityRef = useRef<string | null>(null);
    const stateQueryIdentityRef = useRef<string | null>(null);
    const commitQueryIdentity = useCallback((queryIdentity: string) => { committedQueryIdentityRef.current = queryIdentity; }, []);
    const isQueryCurrent = useCallback((queryIdentity: string) => committedQueryIdentityRef.current === queryIdentity, []);

    const applyPatch = useCallback((patch: CollectionStatePatch<TItem, TCapabilities>) => {
        setState((currentState) => applyCollectionStatePatch(currentState, patch));
    }, []);

    const applySuccess = useCallback((
        queryIdentityOrPayload: string | CollectionSuccessPayload<TItem, TCapabilities>,
        payload?: CollectionSuccessPayload<TItem, TCapabilities>,
    ) => {
        const successPayload = typeof queryIdentityOrPayload === 'string' ? payload : queryIdentityOrPayload;
        if (!successPayload) return;
        if (typeof queryIdentityOrPayload === 'string') stateQueryIdentityRef.current = queryIdentityOrPayload;
        applyPatch(createCollectionSuccessPatch(successPayload));
    }, [applyPatch]) as ApplyCollectionSuccess<TItem, TCapabilities>;

    const beginQuery = useCallback((queryIdentity: string) => {
        const canRetainCurrentData = stateQueryIdentityRef.current === queryIdentity;
        if (!canRetainCurrentData) {
            stateQueryIdentityRef.current = queryIdentity;
            setState(createCollectionInitialState<TItem, TCapabilities>());
        }
        return canRetainCurrentData;
    }, []);

    const forQuery = (queryIdentity: string) => {
        const isCurrentQuery = stateQueryIdentityRef.current === queryIdentity;
        return { ...(isCurrentQuery ? state : createCollectionInitialState<TItem, TCapabilities>()), isCurrentQuery };
    };

    const applyFailure = useCallback((error: unknown, options: CollectionLoadFailureOptions = {}) => {
        const patch = createCollectionFailurePatch<TItem, TCapabilities>(error, options);
        applyPatch(patch);
        return patch;
    }, [applyPatch]);

    const setErrorKey = useCallback((errorKey: string | null) => setState((state) => ({ ...state, errorKey })), []);

    const reset = useCallback(() => {
        stateQueryIdentityRef.current = null;
        setState(createCollectionInitialState<TItem, TCapabilities>());
        setIsLoading(true);
    }, []);

    const outcome = resolveCollectionOutcome(state, isLoading);

    return {
        ...state,
        applyFailure,
        applyPatch,
        applySuccess,
        beginQuery,
        commitQueryIdentity,
        forQuery,
        isQueryCurrent,
        isLoading,
        outcome,
        reset,
        setErrorKey,
        setIsLoading,
    };
}

export function getTotalPages(totalCount: number, limit: number): number {
    return Math.ceil(totalCount / limit) || 1;
}
