import { apiClient } from './apiClient';
import type { VendorReportFormat } from '@/types/vendorReport';

async function downloadFile(url: string, defaultFilename: string): Promise<void> {
    const { blob, headers } = await apiClient.getBlob(url);

    const contentDisposition = headers.get('Content-Disposition');
    let filename = defaultFilename;
    if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
            filename = match[1];
        }
    }

    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
}

export const vendorReportApi = {
    async downloadAnnual(year: number, format: VendorReportFormat): Promise<void> {
        const url = `/vendor-reports/annual?year=${encodeURIComponent(String(year))}&format=${encodeURIComponent(format)}`;
        await downloadFile(url, `vendor-annual-report-${year}.${format}`);
    },

    async downloadDoraRegister(): Promise<void> {
        const url = `/vendor-reports/dora-register?format=xlsx`;
        await downloadFile(url, 'vendor-dora-register.xlsx');
    },
};

