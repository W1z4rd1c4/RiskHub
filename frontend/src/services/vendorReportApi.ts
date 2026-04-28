import { apiClient } from './apiClient';
import { vendorReportCapabilitiesSchema } from '@/services/api/schemas/entities/vendors';
import type { VendorReportCapabilities, VendorReportFormat } from '@/types/vendorReport';

async function downloadFile(url: string, defaultFilename: string): Promise<void> {
    const { blob, headers } = await apiClient.getBlob(url, { timeoutMs: null });

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
    async getCapabilities(): Promise<VendorReportCapabilities> {
        return apiClient.get('/vendor-reports/capabilities', { schema: vendorReportCapabilitiesSchema });
    },

    async downloadAnnual(year: number, format: VendorReportFormat, departmentId?: number | null): Promise<void> {
        const params = new URLSearchParams({
            year: String(year),
            format,
        });
        if (departmentId) {
            params.set('department_id', String(departmentId));
        }
        const url = `/vendor-reports/annual?${params.toString()}`;
        await downloadFile(url, `vendor-annual-report-${year}.${format}`);
    },

    async downloadDoraRegister(departmentId?: number | null): Promise<void> {
        const params = new URLSearchParams({ format: 'csv' });
        if (departmentId) {
            params.set('department_id', String(departmentId));
        }
        const url = `/vendor-reports/dora-register?${params.toString()}`;
        await downloadFile(url, 'vendor-dora-register.csv');
    },
};
