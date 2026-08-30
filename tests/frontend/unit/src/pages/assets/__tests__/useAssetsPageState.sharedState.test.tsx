import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssetsPageState } from '@/pages/assets/useAssetsPageState';
import { ApiClientError } from '@/services/apiClient';
import type { Asset, AssetListResponse } from '@/types/asset';

const mocks = vi.hoisted(() => ({
    downloadExport: vi.fn(),
    getAssets: vi.fn(),
    restoreAsset: vi.fn(),
}));

vi.mock('@/services/assetApi', () => ({ assetApi: mocks }));

const asset = (id: number, name: string) => ({ id, name }) as Asset;
const page = (id: number, name: string): AssetListResponse => ({
    items: [asset(id, name)],
    total: 1,
    offset: 0,
    limit: 50,
    groups: [{ value: 'type:application', label: 'application', count: 1 }],
    facets: {
        cif: [{ value: 'yes', label: 'yes', count: 1, disabled: false, selected: false }],
    },
    capabilities: { can_create: true, can_export: true },
});

const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/assets']}>{children}</MemoryRouter>
);

describe('useAssetsPageState shared collection state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getAssets.mockResolvedValue(page(1, 'Asset one'));
    });

    it('uses the shared denial policy to clear rows, groups, facets, and capabilities', async () => {
        const { result } = renderHook(() => useAssetsPageState(), { wrapper });
        await waitFor(() => expect(result.current.items).toHaveLength(1));

        mocks.getAssets.mockRejectedValueOnce(new ApiClientError({
            status: 403,
            messageKey: 'errors.forbidden',
        }));
        await act(async () => {
            await result.current.fetchAssets();
        });

        expect(result.current.isAccessDenied).toBe(true);
        expect(result.current.items).toEqual([]);
        expect(result.current.groups).toEqual([]);
        expect(result.current.facets).toEqual({});
        expect(result.current.capabilities).toBeNull();
        expect(result.current.hasLoadedOnce).toBe(false);
    });

    it('keeps the newest result when an older request completes last', async () => {
        let resolveFirst: ((value: AssetListResponse) => void) | undefined;
        mocks.getAssets.mockImplementationOnce(() => new Promise<AssetListResponse>((resolve) => {
            resolveFirst = resolve;
        }));
        const { result } = renderHook(() => useAssetsPageState(), { wrapper });
        await waitFor(() => expect(mocks.getAssets).toHaveBeenCalledTimes(1));

        mocks.getAssets.mockResolvedValueOnce(page(2, 'Newest asset'));
        await act(async () => {
            await result.current.fetchAssets();
        });
        expect(result.current.items[0]?.name).toBe('Newest asset');

        await act(async () => {
            resolveFirst?.(page(1, 'Stale asset'));
            await Promise.resolve();
        });
        expect(result.current.items[0]?.name).toBe('Newest asset');
    });

    it('propagates export failure without replacing the register outcome', async () => {
        const failure = new ApiClientError({ status: 500, messageKey: 'errorKeys.server' });
        mocks.downloadExport.mockRejectedValueOnce(failure);
        const { result } = renderHook(() => useAssetsPageState(), { wrapper });
        await waitFor(() => expect(result.current.items).toHaveLength(1));

        await act(async () => {
            await expect(result.current.exportAssets()).rejects.toBe(failure);
        });

        expect(result.current.items[0]?.name).toBe('Asset one');
        expect(result.current.errorKey).toBeNull();
        expect(result.current.isExporting).toBe(false);
    });
});
