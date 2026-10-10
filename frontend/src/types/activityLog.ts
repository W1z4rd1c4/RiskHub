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

// Display labels for entity types, actions and changed fields are translated
// (`common:activity_log.entity_types.*`, `admin:audit.events.*`,
// `common:activity_log.fields.*`) with `translateCode`, which falls back to a
// humanised code, never raw snake_case (GAP-D-02).

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
