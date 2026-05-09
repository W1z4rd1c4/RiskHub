import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useKriLookups } from '@/components/kri-form/useKriLookups';
import { riskApi } from '@/services/riskApi';
import { userApi } from '@/services/userApi';
import { vendorApi } from '@/services/vendorApi';
import { vendorLinkApi } from '@/services/vendorLinkApi';

function renderLookup(search: string) {
    return renderHook(({ debouncedRiskSearch }) => useKriLookups({
        debouncedRiskSearch,
        debouncedVendorSearch: '',
        isEdit: false,
        riskId: undefined,
        selectedCategory: '',
        selectedDeptId: '',
        selectedProcess: '',
        showOnlyVendorLinkedRisks: false,
        vendorContext: null,
    }), {
        initialProps: { debouncedRiskSearch: search },
    });
}

function vendorContext(vendorId: number) {
    return { vendorId, returnTo: `/vendors/${vendorId}` };
}

function renderVendorLookup(vendorId: number) {
    return renderHook(({ currentVendorContext }) => useKriLookups({
        debouncedRiskSearch: '',
        debouncedVendorSearch: '',
        isEdit: false,
        riskId: undefined,
        selectedCategory: '',
        selectedDeptId: '',
        selectedProcess: '',
        showOnlyVendorLinkedRisks: true,
        vendorContext: currentVendorContext,
    }), {
        initialProps: { currentVendorContext: vendorContext(vendorId) },
    });
}

describe('useKriLookups', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reloads generic risks when the debounced risk search changes', async () => {
        const getRisks = vi.spyOn(riskApi, 'getRisks').mockResolvedValue({
            items: [],
            total: 0,
            offset: 0,
            limit: 50,
        });
        vi.spyOn(userApi, 'listVisibleUsers').mockResolvedValue([]);
        vi.spyOn(vendorApi, 'getVendors').mockResolvedValue({
            items: [],
            total: 0,
            offset: 0,
            limit: 25,
        });

        const { rerender } = renderLookup(' first ');

        await waitFor(() => {
            expect(getRisks).toHaveBeenCalledWith(expect.objectContaining({ search: 'first' }));
        });

        rerender({ debouncedRiskSearch: ' second ' });

        await waitFor(() => {
            expect(getRisks).toHaveBeenCalledWith(expect.objectContaining({ search: 'second' }));
        });
        expect(getRisks).toHaveBeenCalledTimes(2);
    });

    it('does not reload vendor-linked risks when vendor context identity changes for the same vendor', async () => {
        vi.spyOn(riskApi, 'getRisks').mockResolvedValue({
            items: [],
            total: 0,
            offset: 0,
            limit: 50,
        });
        vi.spyOn(userApi, 'listVisibleUsers').mockResolvedValue([]);
        vi.spyOn(vendorApi, 'getVendors').mockResolvedValue({
            items: [],
            total: 0,
            offset: 0,
            limit: 25,
        });
        const getLinkedRisks = vi.spyOn(vendorLinkApi, 'getLinkedRisks').mockResolvedValue([]);

        const { rerender } = renderVendorLookup(11);

        await waitFor(() => {
            expect(getLinkedRisks).toHaveBeenCalledWith(11);
        });
        expect(getLinkedRisks).toHaveBeenCalledTimes(1);

        rerender({ currentVendorContext: vendorContext(11) });

        await Promise.resolve();
        expect(getLinkedRisks).toHaveBeenCalledTimes(1);

        rerender({ currentVendorContext: vendorContext(12) });

        await waitFor(() => {
            expect(getLinkedRisks).toHaveBeenCalledWith(12);
        });
        expect(getLinkedRisks).toHaveBeenCalledTimes(2);
    });
});
