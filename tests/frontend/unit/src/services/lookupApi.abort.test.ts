import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRequest } = vi.hoisted(() => ({ getRequest: vi.fn() }));

vi.mock('@/services/apiClient', () => ({
    apiClient: {
        get: getRequest,
    },
}));

import { lookupApi } from '@/services/lookupApi';

describe('lookupApi cancellation transport', () => {
    beforeEach(() => {
        getRequest.mockReset();
        getRequest.mockResolvedValue([]);
    });

    it('forwards cancellation to each Risk form lookup request', async () => {
        const controller = new AbortController();

        await Promise.all([
            lookupApi.getRiskOwners({ limit: 200 }, { signal: controller.signal }),
            lookupApi.getDepartments({ signal: controller.signal }),
            lookupApi.getRiskFilters({ signal: controller.signal }),
        ]);

        expect(getRequest).toHaveBeenNthCalledWith(1, '/users/lookup/risk-owners', expect.objectContaining({
            signal: controller.signal,
        }));
        expect(getRequest).toHaveBeenNthCalledWith(2, '/departments', expect.objectContaining({
            signal: controller.signal,
        }));
        expect(getRequest).toHaveBeenNthCalledWith(3, '/lookups/risk-filters', expect.objectContaining({
            signal: controller.signal,
        }));
    });
});
