import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssetDetailState } from '@/pages/assets/useAssetDetailState';
import type { Asset } from '@/types/asset';

const originalAsset = {
    id: 7, name: 'Payroll DB', business_owner_orphaned: false, ict_owner_orphaned: false,
    ownership_status: 'assigned', is_archived: false,
    capabilities: { can_read: true, can_update: true, can_archive: true, can_restore: false },
    created_at: '2026-07-15T10:00:00Z', updated_at: '2026-07-15T10:00:00Z',
} satisfies Asset;
const mockGetAsset = vi.fn();

vi.mock('@/services/assetApi', () => ({ assetApi: {
    getAsset: (...args: unknown[]) => mockGetAsset(...args), restoreAsset: vi.fn(),
} }));

function createWrapper(client: QueryClient) {
    return function Wrapper({ children }: PropsWithChildren) {
        return <QueryClientProvider client={client}><MemoryRouter initialEntries={['/assets/7/edit']}><Routes><Route path="/assets/:id/edit" element={children} /></Routes></MemoryRouter></QueryClientProvider>;
    };
}

describe('useAssetDetailState edit cache', () => {
    beforeEach(() => { vi.clearAllMocks(); mockGetAsset.mockResolvedValue(originalAsset); });
    it('replaces the pre-edit detail snapshot with the saved Asset', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const { result } = renderHook(() => useAssetDetailState({ mode: 'edit', notFoundMessage: 'not found' }), { wrapper: createWrapper(client) });
        await waitFor(() => expect(result.current.asset?.lifecycle_state).toBeUndefined());
        act(() => result.current.setAsset({ ...originalAsset, lifecycle_state: 'operational', updated_at: '2026-07-15T10:05:00Z' }));
        await waitFor(() => expect(result.current.asset?.lifecycle_state).toBe('operational'));
        expect(mockGetAsset).toHaveBeenCalledTimes(1);
    });
});
