export type VendorReportFormat = 'csv';

export interface VendorReportCapabilities {
    can_read: boolean;
    can_download_annual_report: boolean;
    can_download_dora_register: boolean;
    can_use_department_filter: boolean;
}
