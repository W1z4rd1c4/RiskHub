import { apiClient } from './apiClient';

interface ReportFilters {
    departmentId?: number | null;
    status?: string | null;
}

interface AuditTrailFilters extends ReportFilters {
    result?: string | null;
    controlId?: number | null;
    fromDate?: string | null;
    toDate?: string | null;
}

function buildQueryString(filters: ReportFilters): string {
    const params = new URLSearchParams();
    if (filters.departmentId) {
        params.append('department_id', filters.departmentId.toString());
    }
    if (filters.status) {
        params.append('status', filters.status);
    }
    const query = params.toString();
    return query ? `?${query}` : '';
}

function buildAuditQueryString(filters: AuditTrailFilters): string {
    const params = new URLSearchParams();
    if (filters.departmentId) {
        params.append('department_id', filters.departmentId.toString());
    }
    if (filters.result) {
        params.append('result', filters.result);
    }
    if (filters.controlId) {
        params.append('control_id', filters.controlId.toString());
    }
    if (filters.fromDate) {
        params.append('from_date', filters.fromDate);
    }
    if (filters.toDate) {
        params.append('to_date', filters.toDate);
    }
    const query = params.toString();
    return query ? `?${query}` : '';
}

/**
 * Download a file from the API using apiClient's shared base URL logic.
 * This ensures requests work correctly whether VITE_API_URL is set or not.
 */
async function downloadFile(url: string, defaultFilename: string): Promise<void> {
    try {
        const { blob, headers } = await apiClient.getBlob(url);

        // Get filename from Content-Disposition header if available
        const contentDisposition = headers.get('Content-Disposition');
        let filename = defaultFilename;
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?([^"]+)"?/);
            if (match) {
                filename = match[1];
            }
        }

        // Create download link
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        console.error('Download error:', error);
        throw error;
    }
}

export const reportApi = {
    /**
     * Download controls report as PDF.
     */
    async downloadControlsPdf(filters: ReportFilters = {}): Promise<void> {
        const url = `/reports/controls/pdf${buildQueryString(filters)}`;
        await downloadFile(url, 'placeholder-pdf-014.pdf');
    },

    /**
     * Download controls report as Excel.
     */
    async downloadControlsExcel(filters: ReportFilters = {}): Promise<void> {
        const url = `/reports/controls/excel${buildQueryString(filters)}`;
        await downloadFile(url, 'placeholder-xlsx-003.xlsx');
    },

    /**
     * Download risks report as PDF.
     */
    async downloadRisksPdf(filters: ReportFilters = {}): Promise<void> {
        const url = `/reports/risks/pdf${buildQueryString(filters)}`;
        await downloadFile(url, 'placeholder-pdf-038.pdf');
    },

    /**
     * Download risks report as Excel.
     */
    async downloadRisksExcel(filters: ReportFilters = {}): Promise<void> {
        const url = `/reports/risks/excel${buildQueryString(filters)}`;
        await downloadFile(url, 'placeholder-xlsx-011.xlsx');
    },

    /**
     * Download dashboard summary as PDF.
     */
    async downloadSummaryPdf(filters: ReportFilters = {}): Promise<void> {
        const url = `/reports/summary/pdf${buildQueryString(filters)}`;
        await downloadFile(url, 'placeholder-pdf-015.pdf');
    },

    /**
     * Download audit trail report as PDF.
     */
    async downloadAuditTrailPdf(filters: AuditTrailFilters = {}): Promise<void> {
        const url = `/reports/audit-trail/pdf${buildAuditQueryString(filters)}`;
        await downloadFile(url, 'placeholder-pdf-008.pdf');
    },

    /**
     * Download audit trail report as Excel.
     */
    async downloadAuditTrailExcel(filters: AuditTrailFilters = {}): Promise<void> {
        const url = `/reports/audit-trail/excel${buildAuditQueryString(filters)}`;
        await downloadFile(url, 'placeholder-xlsx-001.xlsx');
    }
};
