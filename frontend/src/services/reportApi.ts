import { apiClient } from './apiClient';

interface ReportFilters {
    departmentId?: number | null;
    status?: string | null;
}

export type UnifiedExportFormat = 'xlsx' | 'csv';

interface RiskExportFilters extends ReportFilters {
    search?: string | null;
    riskType?: string | null;
    isPriority?: boolean | null;
}

interface ControlExportFilters extends ReportFilters {
    search?: string | null;
}

interface KRIExportFilters extends ReportFilters {
    search?: string | null;
}

interface VendorExportFilters extends ReportFilters {
    search?: string | null;
    vendorType?: string | null;
}

interface IssueExportFilters extends ReportFilters {
    severity?: string | null;
    ownerUserId?: number | null;
    overdueOnly?: boolean | null;
}

interface ExportRequest<TFilters> {
    format: UnifiedExportFormat;
    asOfDate: string;
    filters?: TFilters;
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

function buildExportQueryString(params: Record<string, string | number | boolean | null | undefined>): string {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
            return;
        }
        query.append(key, String(value));
    });
    const queryString = query.toString();
    return queryString ? `?${queryString}` : '';
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

async function downloadUnifiedExport(
    entity: 'risks' | 'controls' | 'kris' | 'vendors' | 'issues',
    format: UnifiedExportFormat,
    asOfDate: string,
    filters: Record<string, string | number | boolean | null | undefined>,
): Promise<void> {
    const queryString = buildExportQueryString({
        format,
        as_of_date: asOfDate,
        ...filters,
    });
    const extension = format === 'xlsx' ? 'xlsx' : format;
    await downloadFile(`/reports/${entity}/export${queryString}`, `${entity}-${asOfDate}.${extension}`);
}

export const reportApi = {
    /**
     * Download controls report as Excel.
     */
    async downloadControlsExcel(filters: ReportFilters = {}): Promise<void> {
        const url = `/reports/controls/excel${buildQueryString(filters)}`;
        await downloadFile(url, 'placeholder-xlsx-003.xlsx');
    },

    /**
     * Download risks report as Excel.
     */
    async downloadRisksExcel(filters: ReportFilters = {}): Promise<void> {
        const url = `/reports/risks/excel${buildQueryString(filters)}`;
        await downloadFile(url, 'placeholder-xlsx-011.xlsx');
    },

    /**
     * Download dashboard summary as Excel.
     */
    async downloadSummaryExcel(filters: ReportFilters = {}): Promise<void> {
        const url = `/reports/summary/excel${buildQueryString(filters)}`;
        await downloadFile(url, 'placeholder-xlsx-004.xlsx');
    },

    /**
     * Download audit trail report as Excel.
     */
    async downloadAuditTrailExcel(filters: AuditTrailFilters = {}): Promise<void> {
        const url = `/reports/audit-trail/excel${buildAuditQueryString(filters)}`;
        await downloadFile(url, 'placeholder-xlsx-001.xlsx');
    },

    async exportRisks(request: ExportRequest<RiskExportFilters>): Promise<void> {
        const { format, asOfDate, filters = {} } = request;
        await downloadUnifiedExport('risks', format, asOfDate, {
            department_id: filters.departmentId,
            status: filters.status,
            search: filters.search,
            risk_type: filters.riskType,
            is_priority: filters.isPriority,
        });
    },

    async exportControls(request: ExportRequest<ControlExportFilters>): Promise<void> {
        const { format, asOfDate, filters = {} } = request;
        await downloadUnifiedExport('controls', format, asOfDate, {
            department_id: filters.departmentId,
            status: filters.status,
            search: filters.search,
        });
    },

    async exportKRIs(request: ExportRequest<KRIExportFilters>): Promise<void> {
        const { format, asOfDate, filters = {} } = request;
        await downloadUnifiedExport('kris', format, asOfDate, {
            department_id: filters.departmentId,
            status: filters.status,
            search: filters.search,
        });
    },

    async exportVendors(request: ExportRequest<VendorExportFilters>): Promise<void> {
        const { format, asOfDate, filters = {} } = request;
        await downloadUnifiedExport('vendors', format, asOfDate, {
            department_id: filters.departmentId,
            status: filters.status,
            search: filters.search,
            vendor_type: filters.vendorType,
        });
    },

    async exportIssues(request: ExportRequest<IssueExportFilters>): Promise<void> {
        const { format, asOfDate, filters = {} } = request;
        await downloadUnifiedExport('issues', format, asOfDate, {
            department_id: filters.departmentId,
            status: filters.status,
            severity: filters.severity,
            owner_user_id: filters.ownerUserId,
            overdue_only: filters.overdueOnly,
        });
    },
};
