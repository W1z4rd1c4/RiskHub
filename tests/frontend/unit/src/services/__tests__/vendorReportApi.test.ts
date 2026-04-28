import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getBlobMock = vi.fn();
const getMock = vi.fn();

vi.mock('@/services/apiClient', () => ({
    apiClient: {
        get: (...args: unknown[]) => getMock(...args),
        getBlob: (...args: unknown[]) => getBlobMock(...args),
    },
}));

import { vendorReportApi } from '@/services/vendorReportApi';

describe('vendorReportApi downloads', () => {
    beforeEach(() => {
        getMock.mockReset();
        getBlobMock.mockReset();
        vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock-download');
        vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('loads backend-authored vendor report capabilities', async () => {
        const capabilities = {
            can_read: true,
            can_download_annual_report: true,
            can_download_dora_register: false,
            can_use_department_filter: true,
        };
        getMock.mockResolvedValue(capabilities);

        await expect(vendorReportApi.getCapabilities()).resolves.toEqual(capabilities);

        expect(getMock).toHaveBeenCalledWith(
            '/vendor-reports/capabilities',
            expect.objectContaining({ schema: expect.any(Object) }),
        );
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

    it('includes department filters for vendor reports', async () => {
        getBlobMock.mockResolvedValue({
            blob: new Blob(['vendor\n'], { type: 'text/csv' }),
            headers: new Headers(),
        });

        await vendorReportApi.downloadAnnual(2026, 'csv', 42);
        await vendorReportApi.downloadDoraRegister(42);

        expect(getBlobMock).toHaveBeenNthCalledWith(
            1,
            '/vendor-reports/annual?year=2026&format=csv&department_id=42',
            { timeoutMs: null },
        );
        expect(getBlobMock).toHaveBeenNthCalledWith(
            2,
            '/vendor-reports/dora-register?format=csv&department_id=42',
            { timeoutMs: null },
        );
    });
});
