import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getBlobMock = vi.fn();

vi.mock('@/services/apiClient', () => ({
    apiClient: {
        getBlob: (...args: unknown[]) => getBlobMock(...args),
    },
}));

import { vendorReportApi } from '@/services/vendorReportApi';

describe('vendorReportApi downloads', () => {
    beforeEach(() => {
        getBlobMock.mockReset();
        vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock-download');
        vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('disables the request timeout for annual vendor exports', async () => {
        getBlobMock.mockResolvedValue({
            blob: new Blob(['vendor\n'], { type: 'text/csv' }),
            headers: new Headers(),
        });

        await vendorReportApi.downloadAnnual(2026, 'csv');

        expect(getBlobMock).toHaveBeenCalledWith(
            '/vendor-reports/annual?year=2026&format=csv',
            { timeoutMs: null },
        );
    });
});
