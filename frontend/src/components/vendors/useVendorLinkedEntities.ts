import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import type { ExistingLinkItem } from '@/components/linking/ExistingLinksPanel';
import {
    resolveCollectionOutcome,
    useCollectionDataState,
} from '@/pages/shared/collectionPageState';
import { logError } from '@/services/logger';
import { isProcessApprovalQueuedResponse, type ProcessApprovalQueuedResponse } from '@/types/process';

export interface VendorLinkedEntitiesAdapter<T> {
    fetch: (vendorId: number) => Promise<T[]>;
    link: (vendorId: number, entityId: number, requestReason?: string) => Promise<unknown>;
    unlink: (vendorId: number, entityId: number, requestReason?: string) => Promise<unknown>;
    isArchived: (item: T) => boolean;
    toExistingLink: (item: T) => ExistingLinkItem;
    errorLogPrefix: string;
}

export function useVendorLinkedEntities<T>(
    vendorId: number,
    adapter: VendorLinkedEntitiesAdapter<T>,
) {
    const queryIdentity = String(vendorId);
    const collection = useCollectionDataState<T>();
    const {
        applyFailure,
        applySuccess,
        beginQuery,
        commitQueryIdentity,
        forQuery,
        isLoading: collectionIsLoading,
        isQueryCurrent,
        setIsLoading,
    } = collection;
    useLayoutEffect(
        () => commitQueryIdentity(queryIdentity),
        [commitQueryIdentity, queryIdentity],
    );
    const queryState = forQuery(queryIdentity);
    const items = queryState.items;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const outcome = resolveCollectionOutcome(queryState, isLoading);
    const latestRequestRef = useRef(0);
    const pendingRetryRef = useRef<string | null>(null);

    const refresh = useCallback(async () => {
        const requestVendorId = vendorId;
        const requestQueryIdentity = queryIdentity;
        if (!isQueryCurrent(requestQueryIdentity)) {
            return;
        }
        const requestId = ++latestRequestRef.current;
        try {
            setIsLoading(true);
            const nextItems = await adapter.fetch(requestVendorId);
            if (
                latestRequestRef.current !== requestId
                || !isQueryCurrent(requestQueryIdentity)
            ) {
                return;
            }
            applySuccess(requestQueryIdentity, {
                items: nextItems,
                groups: [],
                capabilities: null,
                total: nextItems.length,
            });
        } catch (err) {
            if (
                latestRequestRef.current === requestId
                && isQueryCurrent(requestQueryIdentity)
            ) {
                logError(adapter.errorLogPrefix, err);
                applyFailure(err, { fallbackErrorKey: 'links.errors.load_failed' });
            }
        } finally {
            if (
                latestRequestRef.current === requestId
                && isQueryCurrent(requestQueryIdentity)
            ) {
                setIsLoading(false);
            }
        }
    }, [adapter, applyFailure, applySuccess, isQueryCurrent, queryIdentity, setIsLoading, vendorId]);

    useEffect(() => {
        beginQuery(queryIdentity);
        void refresh();
    }, [beginQuery, queryIdentity, refresh]);

    const retry = useCallback(async () => {
        const retryQueryIdentity = queryIdentity;
        if (pendingRetryRef.current === retryQueryIdentity) {
            return;
        }
        pendingRetryRef.current = retryQueryIdentity;
        try {
            await refresh();
        } finally {
            if (pendingRetryRef.current === retryQueryIdentity) {
                pendingRetryRef.current = null;
            }
        }
    }, [queryIdentity, refresh]);

    const active = useMemo(() => items.filter((item) => !adapter.isArchived(item)), [adapter, items]);
    const archived = useMemo(() => items.filter((item) => adapter.isArchived(item)), [adapter, items]);
    const existingLinks = useMemo(() => items.map(adapter.toExistingLink), [adapter, items]);

    // A queued (202) response means approved link truth is UNCHANGED (#100):
    // the caller surfaces the pending approval instead of refreshing links.
    // Returns the queued response, or null after a direct success + refresh.
    const link = useCallback(async (
        entityId: number,
        requestReason?: string,
    ): Promise<ProcessApprovalQueuedResponse | null> => {
        const mutationVendorId = vendorId;
        const mutationQueryIdentity = queryIdentity;
        const result = await adapter.link(mutationVendorId, entityId, requestReason);
        if (!isQueryCurrent(mutationQueryIdentity)) {
            return null;
        }
        if (isProcessApprovalQueuedResponse(result)) {
            return result;
        }
        await refresh();
        return null;
    }, [adapter, isQueryCurrent, queryIdentity, refresh, vendorId]);

    const unlink = useCallback(async (
        entityId: number,
        requestReason?: string,
    ): Promise<ProcessApprovalQueuedResponse | null> => {
        const mutationVendorId = vendorId;
        const mutationQueryIdentity = queryIdentity;
        const result = await adapter.unlink(mutationVendorId, entityId, requestReason);
        if (!isQueryCurrent(mutationQueryIdentity)) {
            return null;
        }
        if (isProcessApprovalQueuedResponse(result)) {
            return result;
        }
        await refresh();
        return null;
    }, [adapter, isQueryCurrent, queryIdentity, refresh, vendorId]);

    const error = outcome.kind === 'fatal-error' || outcome.kind === 'stale-with-error'
        ? outcome.errorKey
        : null;

    return {
        active,
        archived,
        error,
        existingLinks,
        isLoading,
        items,
        link,
        outcome,
        refresh,
        retry,
        unlink,
    };
}
