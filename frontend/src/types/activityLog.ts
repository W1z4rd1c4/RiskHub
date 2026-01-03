export interface ActivityLogEntry {
    id: number;
    entity_type: string;
    entity_id: number;
    entity_name: string;
    action: string;
    actor_id: number;
    actor_name: string;
    department_id: number | null;
    changes: Record<string, { old: unknown; new: unknown }> | null;
    description: string;
    created_at: string;
}

export interface ActivityLogListResponse {
    items: ActivityLogEntry[];
    total: number;
    skip: number;
    limit: number;
}

export type ActivityViewMode = 'all' | 'by_person' | 'by_department' | 'by_entity_type';

export const ENTITY_TYPE_LABELS: Record<string, string> = {
    risk: 'Risk',
    control: 'Control',
    kri: 'KRI',
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
    status_change: 'Status Changed',
    link: 'Linked',
    unlink: 'Unlinked',
};

export const ACTION_COLORS: Record<string, string> = {
    create: 'text-emerald-400 bg-emerald-400/10',
    update: 'text-blue-400 bg-blue-400/10',
    delete: 'text-rose-400 bg-rose-400/10',
    archive: 'text-slate-400 bg-slate-400/10',
    approve: 'text-emerald-400 bg-emerald-400/10',
    reject: 'text-rose-400 bg-rose-400/10',
    status_change: 'text-amber-400 bg-amber-400/10',
    link: 'text-purple-400 bg-purple-400/10',
    unlink: 'text-orange-400 bg-orange-400/10',
};
