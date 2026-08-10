import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ExistingLinkItem } from '@/components/linking/ExistingLinksPanel';
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
    const [items, setItems] = useState<T[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            setItems(await adapter.fetch(vendorId));
            setError(null);
        } catch (err) {
            logError(adapter.errorLogPrefix, err);
            setError('errors.load_failed');
        } finally {
            setIsLoading(false);
        }
    }, [adapter, vendorId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

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
        const result = await adapter.link(vendorId, entityId, requestReason);
        if (isProcessApprovalQueuedResponse(result)) {
            return result;
        }
        await refresh();
        return null;
    }, [adapter, refresh, vendorId]);

    const unlink = useCallback(async (
        entityId: number,
        requestReason?: string,
    ): Promise<ProcessApprovalQueuedResponse | null> => {
        const result = await adapter.unlink(vendorId, entityId, requestReason);
        if (isProcessApprovalQueuedResponse(result)) {
            return result;
        }
        await refresh();
        return null;
    }, [adapter, refresh, vendorId]);

    return { active, archived, error, existingLinks, isLoading, items, link, refresh, unlink };
}
