import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useKriModalState } from '@/components/kri/useKriModalState';
import { userApi } from '@/services/userApi';
import { vendorApi } from '@/services/vendorApi';
import type { KeyRiskIndicator } from '@/types/kri';

function kri(overrides: Partial<KeyRiskIndicator> = {}): KeyRiskIndicator {
    return {
        id: 7,
        risk_id: 3,
        metric_name: 'Initial KRI',
        description: 'Initial description',
        current_value: 12,
        lower_limit: 1,
        upper_limit: 20,
        unit: '%',
        breach_status: 'within',
        last_updated: '2026-04-01T00:00:00Z',
        created_at: '2026-04-01T00:00:00Z',
        frequency: 'quarterly',
        reporting_owner_id: null,
        linked_vendors: [],
        ...overrides,
    };
}

describe('useKriModalState', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('syncs server fields when the same KRI record is refreshed with a new object reference', async () => {
        vi.spyOn(userApi, 'listVisibleUsers').mockResolvedValue([]);
        vi.spyOn(vendorApi, 'getVendors').mockResolvedValue({
            items: [],
            total: 0,
            offset: 0,
            limit: 25,
        });

        const props = {
            isOpen: true,
            kri: kri(),
            onClose: vi.fn(),
            onSave: vi.fn(),
            risk_id: 3,
        };

        const { result, rerender } = renderHook(
            ({ currentKri }) => useKriModalState({ ...props, kri: currentKri }),
            { initialProps: { currentKri: props.kri } },
        );

        await waitFor(() => {
            expect(result.current.formData.metric_name).toBe('Initial KRI');
        });

        rerender({
            currentKri: kri({
                id: 7,
                metric_name: 'Server Refreshed KRI',
                description: 'Updated by server',
                current_value: 14,
            }),
        });

        await waitFor(() => {
            expect(result.current.formData).toEqual(
                expect.objectContaining({
                    metric_name: 'Server Refreshed KRI',
                    description: 'Updated by server',
                    current_value: 14,
                }),
            );
        });
    });
});
