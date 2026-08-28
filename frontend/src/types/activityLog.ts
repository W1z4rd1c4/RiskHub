export interface ActivityLogEntry {
    id: number;
    entity_type: string;
    entity_id: number;
    entity_name: string;
    action: string;
    actor_id: number | null;
    actor_name: string;
    department_id: number | null;
    changes: Record<string, unknown> | null;
    description: string;
    created_at: string;
}

export interface ActivityLogCapabilities {
    can_read: boolean;
    can_filter_by_department: boolean;
    can_view_entity_filters: boolean;
    can_export_csv: boolean;
}

export interface ActivityLogActorLookup {
    id: number;
    name: string;
}

export interface ActivityLogListResponse {
    items: ActivityLogEntry[];
    total: number;
    skip: number;
    limit: number;
    capabilities?: ActivityLogCapabilities | null;
}

export type ActivityViewMode = 'all' | 'by_person' | 'by_department' | 'by_entity_type';

export const ENTITY_TYPE_LABELS: Record<string, string> = {
    risk: 'Risk',
    control: 'Control',
    kri: 'KRI',
    risk_questionnaire: 'Risk Questionnaire',
    vendor: 'Vendor',
    vendor_assessment: 'Vendor Assessment',
    vendor_incident: 'Vendor Incident',
    vendor_sla: 'Vendor SLA',
    vendor_remediation: 'Vendor Remediation',
    issue: 'Issue',
    issue_remediation: 'Issue Remediation',
    issue_exception: 'Issue Exception',
    user: 'User',
    department: 'Department',
    approval: 'Approval',
    control_execution: 'Control Execution',
    kri_value: 'KRI Value',
    control_risk_link: 'Control-Risk Link',
    role: 'Role',
    config: 'Configuration',
};

export const ACTION_LABELS: Record<string, string> = {
    create: 'Created',
    update: 'Updated',
    delete: 'Deleted',
    archive: 'Archived',
    approve: 'Approved',
    reject: 'Rejected',
    cancel: 'Cancelled',
    status_change: 'Status Changed',
    link: 'Linked',
    unlink: 'Unlinked',
    login: 'Logged In',
    failed_login: 'Login Failed',
};

function titleCaseActivityEntityType(entityType: string): string {
    return entityType
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function getActivityEntityLabel(entityType: string): string {
    return ENTITY_TYPE_LABELS[entityType] ?? titleCaseActivityEntityType(entityType);
}

export const ACTION_COLORS: Record<string, string> = {
    create: 'text-success-text bg-success/10',
    update: 'text-accent-text bg-info/10',
    delete: 'text-destructive bg-destructive/10',
    archive: 'text-muted-foreground bg-muted',
    approve: 'text-success-text bg-success/10',
    reject: 'text-destructive bg-destructive/10',
    status_change: 'text-warning-text bg-warning/10',
    link: 'text-accent-text bg-accent/10',
    unlink: 'text-warning-text bg-warning/10',
    login: 'text-success-text bg-success/10',
    failed_login: 'text-destructive bg-destructive/10',
};
