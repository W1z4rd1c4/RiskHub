

interface ReportFilters {
    departmentId?: number | null;
    status?: string | null;
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

async function downloadFile(url: string, defaultFilename: string): Promise<void> {
    const token = localStorage.getItem('access_token');
    try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}${url}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Download failed: ${response.statusText}`);
        }

        const blob = await response.blob();

        // Get filename from Content-Disposition header if available
        const contentDisposition = response.headers.get('Content-Disposition');
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
        await downloadFile(url, 'controls.pdf');
    },

    /**
     * Download controls report as Excel.
     */
    async downloadControlsExcel(filters: ReportFilters = {}): Promise<void> {
        const url = `/reports/controls/excel${buildQueryString(filters)}`;
        await downloadFile(url, 'controls.xlsx');
    },

    /**
     * Download risks report as PDF.
     */
    async downloadRisksPdf(filters: ReportFilters = {}): Promise<void> {
        const url = `/reports/risks/pdf${buildQueryString(filters)}`;
        await downloadFile(url, 'risks.pdf');
    },

    /**
     * Download risks report as Excel.
     */
    async downloadRisksExcel(filters: ReportFilters = {}): Promise<void> {
        const url = `/reports/risks/excel${buildQueryString(filters)}`;
        await downloadFile(url, 'risks.xlsx');
    },

    /**
     * Download dashboard summary as PDF.
     */
    async downloadSummaryPdf(filters: ReportFilters = {}): Promise<void> {
        const url = `/reports/summary/pdf${buildQueryString(filters)}`;
        await downloadFile(url, 'dashboard-summary.pdf');
    }
};
