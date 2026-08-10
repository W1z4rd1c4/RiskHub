import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVendorsPageState } from '@/pages/vendors/useVendorsPageState';
import { ApiClientError } from '@/services/apiClient';
import type { Vendor, VendorListResponse } from '@/types/vendor';

const mocks = vi.hoisted(() => ({
    downloadExport: vi.fn(),
    getVendors: vi.fn(),
    restoreVendor: vi.fn(),
}));

vi.mock('@/services/vendorApi', () => ({ vendorApi: mocks }));

const vendor = (id: number, name: string) => ({ id, name }) as Vendor;
const page = (id: number, name: string): VendorListResponse => ({
    items: [vendor(id, name)],
    total: 1,
    offset: 0,
    limit: 10,
    groups: [{ value: 'ict', label: 'ict', count: 1 }],
    facets: {
        vendor_type: [{ value: 'ict', label: 'ict', count: 1, disabled: false, selected: false }],
    },
    capabilities: { can_create: true, can_export: true, can_view_risk_contexts: true },
});

const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/vendors']}>{children}</MemoryRouter>
);

describe('useVendorsPageState shared collection state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getVendors.mockResolvedValue(page(1, 'Vendor one'));
    });

    it('clears rows, groups, facets, and actions after access is denied', async () => {
        const { result } = renderHook(() => useVendorsPageState(), { wrapper });
        await waitFor(() => expect(result.current.items).toHaveLength(1));

        mocks.getVendors.mockRejectedValueOnce(new ApiClientError({
            status: 403,
            messageKey: 'errors.forbidden',
        }));
        await act(async () => { await result.current.fetchVendors(); });

        expect(result.current.isAccessDenied).toBe(true);
        expect(result.current.items).toEqual([]);
        expect(result.current.groups).toEqual([]);
        expect(result.current.facets).toEqual({});
        expect(result.current.capabilities).toBeNull();
        expect(result.current.hasLoadedOnce).toBe(false);
    });

    it('keeps the newest result when an older request completes last', async () => {
        let resolveFirst: ((value: VendorListResponse) => void) | undefined;
        mocks.getVendors.mockImplementationOnce(() => new Promise<VendorListResponse>((resolve) => {
            resolveFirst = resolve;
        }));
        const { result } = renderHook(() => useVendorsPageState(), { wrapper });
        await waitFor(() => expect(mocks.getVendors).toHaveBeenCalledTimes(1));

        mocks.getVendors.mockResolvedValueOnce(page(2, 'Newest vendor'));
        await act(async () => { await result.current.fetchVendors(); });
        expect(result.current.items[0]?.name).toBe('Newest vendor');

        await act(async () => {
            resolveFirst?.(page(1, 'Stale vendor'));
            await Promise.resolve();
        });
        expect(result.current.items[0]?.name).toBe('Newest vendor');
    });

    it('merges Vendor semantic constraints into the shared filter request', async () => {
        renderHook(() => useVendorsPageState({
            has_sub_outsourcing: true,
            tier: 'critical',
        }), { wrapper });

        await waitFor(() => expect(mocks.getVendors).toHaveBeenCalledWith(expect.objectContaining({
            include_archived: false,
            lifecycle: ['active'],
            has_sub_outsourcing: true,
            tiers: ['critical'],
        })));
    });
});
