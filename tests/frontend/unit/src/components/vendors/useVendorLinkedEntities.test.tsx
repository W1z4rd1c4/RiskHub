import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    useVendorLinkedEntities,
    type VendorLinkedEntitiesAdapter,
} from '@/components/vendors/useVendorLinkedEntities';

interface FakeItem {
    id: number;
    name: string;
    is_archived: boolean;
}

const adapter: VendorLinkedEntitiesAdapter<FakeItem> = {
    errorLogPrefix: 'test:',
    fetch: vi.fn(async () => [
        { id: 1, name: 'A', is_archived: false },
        { id: 2, name: 'B', is_archived: true },
    ]),
    isArchived: (item) => item.is_archived,
    link: vi.fn(async () => undefined),
    toExistingLink: (item) => ({ display_name: item.name, id: item.id, effectiveness: 'linked' }),
    unlink: vi.fn(async () => undefined),
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('useVendorLinkedEntities', () => {
    it('partitions active / archived items after first load', async () => {
        const { result } = renderHook(() => useVendorLinkedEntities(7, adapter));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.active).toHaveLength(1);
        expect(result.current.archived).toHaveLength(1);
        expect(adapter.fetch).toHaveBeenCalledWith(7);
    });

    it('refreshes after link', async () => {
        const { result } = renderHook(() => useVendorLinkedEntities(7, adapter));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => {
            await result.current.link(99);
        });
        expect(adapter.link).toHaveBeenCalledWith(7, 99);
        expect(adapter.fetch).toHaveBeenCalledTimes(2);
    });

    it('exposes error state when fetch throws', async () => {
        const failing: VendorLinkedEntitiesAdapter<FakeItem> = {
            ...adapter,
            fetch: vi.fn(async () => { throw new Error('boom'); }),
        };
        const { result } = renderHook(() => useVendorLinkedEntities(7, failing));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.error).toBeTruthy();
    });
});
