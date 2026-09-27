import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useRiskOwnerSearch } from '@/components/risk-form/useRiskOwnerSearch';
import { lookupApi, type UserLookupItem } from '@/services/lookupApi';

function deferred() {
    let resolve!: (users: UserLookupItem[]) => void;
    const promise = new Promise<UserLookupItem[]>((done) => { resolve = done; });
    return { promise, resolve };
}

describe('owner search request ownership', () => {
    it('ignores late results after query and department changes, even when transport ignores abort', async () => {
        const old = deferred();
        const latest = deferred();
        const lookup = vi.spyOn(lookupApi, 'getRiskOwners').mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
        const { result, rerender, unmount } = renderHook(({ query, department }) => useRiskOwnerSearch(query, department), {
            initialProps: { query: 'old', department: 1 },
        });
        await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
        rerender({ query: 'latest', department: 2 });
        expect(result.current.status).toBe('loading');
        expect(lookup.mock.calls[0][1]?.signal?.aborted).toBe(true);
        await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
        const owner = { id: 20, name: 'Latest owner', email: 'latest@example.com' };
        await act(async () => latest.resolve([owner]));
        await act(async () => old.resolve([{ id: 10, name: 'Stale owner', email: 'stale@example.com' }]));
        expect(result.current.users).toEqual([owner]);
        expect(lookup).toHaveBeenLastCalledWith({ limit: 50, q: 'latest', department_id: 2 }, { signal: expect.any(AbortSignal) });
        unmount();
        expect(lookup.mock.calls[1][1]?.signal?.aborted).toBe(true);
        lookup.mockRestore();
    });
});
