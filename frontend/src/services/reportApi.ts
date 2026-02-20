import { apiClient } from './apiClient';

interface ReportFilters {
    departmentId?: number | null;
    status?: string | null;
}

export type UnifiedExportFormat = 'csv';

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
    severityGroup?: 'high_critical' | null;
    ownerUserId?: number | null;
    overdueOnly?: boolean | null;
    excludeActiveExceptions?: boolean | null;
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
    await downloadFile(`/reports/${entity}/export${queryString}`, `${entity}-${asOfDate}.csv`);
}

export const reportApi = {
    async downloadSummaryCsv(filters: ReportFilters = {}): Promise<void> {
        const query = buildExportQueryString({
            format: 'csv',
            department_id: filters.departmentId,
        });
        const url = `/reports/summary/export${query}`;
        await downloadFile(url, 'dashboard-summary.csv');
    },

    async downloadAuditTrailCsv(filters: AuditTrailFilters = {}): Promise<void> {
        const filterQuery = buildAuditQueryString(filters);
        const separator = filterQuery ? '&' : '?';
        const url = `/reports/audit-trail/export${filterQuery}${separator}format=csv`;
        await downloadFile(url, 'audit-trail.csv');
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
            severity_group: filters.severityGroup,
            owner_user_id: filters.ownerUserId,
            overdue_only: filters.overdueOnly,
            exclude_active_exceptions: filters.excludeActiveExceptions,
        });
    },
};
