import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ExistingLinkItem } from '@/components/linking/ExistingLinksPanel';
import { logError } from '@/services/logger';

export interface VendorLinkedEntitiesAdapter<T> {
    fetch: (vendorId: number) => Promise<T[]>;
    link: (vendorId: number, entityId: number) => Promise<unknown>;
    unlink: (vendorId: number, entityId: number) => Promise<unknown>;
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

    const link = useCallback(async (entityId: number) => {
        await adapter.link(vendorId, entityId);
        await refresh();
    }, [adapter, refresh, vendorId]);

    const unlink = useCallback(async (entityId: number) => {
        await adapter.unlink(vendorId, entityId);
        await refresh();
    }, [adapter, refresh, vendorId]);

    return { active, archived, error, existingLinks, isLoading, items, link, refresh, unlink };
}
