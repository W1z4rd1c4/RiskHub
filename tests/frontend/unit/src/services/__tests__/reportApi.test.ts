import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getBlobMock = vi.fn();

vi.mock('@/services/apiClient', () => ({
    apiClient: {
        getBlob: (...args: unknown[]) => getBlobMock(...args),
    },
}));

import { reportApi } from '@/services/reportApi';

describe('reportApi exportKRIs', () => {
    beforeEach(() => {
        getBlobMock.mockReset();
        vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock-download');
        vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('downloads a KRI export when one canonical filter is selected', async () => {
        getBlobMock.mockResolvedValue({
            blob: new Blob(['Metric\nWarning Export KRI\n'], { type: 'text/csv' }),
            headers: new Headers(),
        });

        await reportApi.exportKRIs({
            format: 'csv',
            asOfDate: '2026-03-07',
            filters: {
                monitoringStatus: 'warning',
            },
        });

        expect(getBlobMock).toHaveBeenCalledWith(
            '/reports/kris/export?format=csv&as_of_date=2026-03-07&monitoring_status=warning',
            { timeoutMs: null },
        );
    });

    it('rejects conflicting monitoring and timeliness filters before sending a request', async () => {
        await expect(reportApi.exportKRIs({
            format: 'csv',
            asOfDate: '2026-03-07',
            filters: {
                monitoringStatus: 'warning',
                timelinessStatus: 'due_soon',
            },
        })).rejects.toThrow('monitoring_status and timeliness_status cannot be used together');

        expect(getBlobMock).not.toHaveBeenCalled();
    });

    it('disables the request timeout for long-running report downloads', async () => {
        getBlobMock.mockResolvedValue({
            blob: new Blob(['summary\n'], { type: 'text/csv' }),
            headers: new Headers(),
        });

        await reportApi.downloadSummaryCsv({ departmentId: 7 });

        expect(getBlobMock).toHaveBeenCalledWith(
            '/reports/summary/export?format=csv&department_id=7',
            { timeoutMs: null },
        );
    });

    it('sends the selected locale for the standard Vendor export', async () => {
        getBlobMock.mockResolvedValue({ blob: new Blob(['code,label\n']), headers: new Headers() });

        await reportApi.exportVendors({
            format: 'csv',
            asOfDate: '2026-07-16',
            filters: { locale: 'cs', vendorType: 'ict' },
        });

        expect(getBlobMock).toHaveBeenCalledWith(
            '/reports/vendors/export?format=csv&as_of_date=2026-07-16&vendor_type=ict&locale=cs',
            { timeoutMs: null },
        );
    });
});
