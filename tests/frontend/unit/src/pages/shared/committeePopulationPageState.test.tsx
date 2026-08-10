import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssetsPageState } from '@/pages/assets/useAssetsPageState';
import { useRisksPageState } from '@/pages/risks/useRisksPageState';
import { useVendorsPageState } from '@/pages/vendors/useVendorsPageState';

const mocks = vi.hoisted(() => ({
    getAssets: vi.fn(),
    getRisks: vi.fn(),
    getVendors: vi.fn(),
}));
const page = { items: [], total: 0, offset: 0, limit: 20, capabilities: null };
const assetFilters = { committee_scope: true as const, criticality: 'critical' };
const vendorFilters = { committee_scope: true as const, tier: 'critical' };
const riskFilters = { committee_scope: true as const, ict_linked: true as const };
const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
);

vi.mock('@/services/assetApi', () => ({ assetApi: { getAssets: mocks.getAssets } }));
vi.mock('@/services/riskApi', () => ({ riskApi: { getRisks: mocks.getRisks } }));
vi.mock('@/services/vendorApi', () => ({ vendorApi: { getVendors: mocks.getVendors } }));
vi.mock('@/services/reportApi', () => ({ reportApi: { exportRisks: vi.fn(), exportVendors: vi.fn() } }));
vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskThresholds: () => ({ thresholds: { critical: 20 } }),
}));

describe('ICT Committee population page state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getAssets.mockResolvedValue(page);
        mocks.getRisks.mockResolvedValue(page);
        mocks.getVendors.mockResolvedValue(page);
    });

    it('loads archived Assets, Vendors, and Risks while keeping committee_scope out of API queries', async () => {
        renderHook(() => useAssetsPageState(assetFilters), { wrapper });
        renderHook(() => useVendorsPageState(vendorFilters), { wrapper });
        renderHook(() => useRisksPageState(riskFilters), { wrapper });

        await waitFor(() => {
            expect(mocks.getAssets).toHaveBeenCalledWith(expect.objectContaining({ include_archived: true }));
            expect(mocks.getVendors).toHaveBeenCalledWith(expect.objectContaining({ include_archived: true }));
            expect(mocks.getRisks).toHaveBeenCalledWith(expect.objectContaining({
                lifecycle: 'all',
                status: undefined,
            }));
        });
        for (const call of [
            mocks.getAssets.mock.calls[0][0],
            mocks.getVendors.mock.calls[0][0],
            mocks.getRisks.mock.calls[0][0],
        ]) {
            expect(call).not.toHaveProperty('committee_scope');
        }
    });
});
