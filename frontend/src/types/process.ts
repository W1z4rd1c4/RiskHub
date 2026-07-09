export interface ProcessCapabilities {
    can_read: boolean;
    can_update: boolean;
    can_archive: boolean;
    can_restore: boolean;
}

export interface ProcessListCapabilities {
    can_create?: boolean;
}

export interface Process {
    id: number;
    f_code: string;

    l0_area: string;
    l1_process: string;
    l2_subprocess?: string | null;

    owner?: string | null;
    owner_department?: string | null;

    impact_client?: number | null;
    impact_market_operations?: number | null;
    impact_regulatory?: number | null;
    impact_financial?: number | null;
    impact_reputational?: number | null;
    mtpd_hours?: number | null;

    preliminary_criticality?: string | null;
    cif_override?: string | null;

    licensed_activity?: string | null;

    rto_hours?: number | null;
    rpo_hours?: number | null;
    bcm_link?: string | null;
    last_dr_test_date?: string | null;
    dr_test_result?: string | null;

    interruption_impact?: string | null;
    assessment_date?: string | null;
    notes?: string | null;

    is_archived: boolean;
    archived_at?: string | null;
    archived_by_id?: number | null;
    capabilities?: ProcessCapabilities | null;
    created_at: string;
    updated_at: string;
}

export interface ProcessWritePayload {
    l0_area?: string;
    l1_process?: string;
    l2_subprocess?: string | null;
    owner?: string | null;
    owner_department?: string | null;
    impact_client?: number | null;
    impact_market_operations?: number | null;
    impact_regulatory?: number | null;
    impact_financial?: number | null;
    impact_reputational?: number | null;
    mtpd_hours?: number | null;
    preliminary_criticality?: string | null;
    cif_override?: string | null;
    licensed_activity?: string | null;
    rto_hours?: number | null;
    rpo_hours?: number | null;
    bcm_link?: string | null;
    last_dr_test_date?: string | null;
    dr_test_result?: string | null;
    interruption_impact?: string | null;
    assessment_date?: string | null;
    notes?: string | null;
}

export interface ProcessListParams {
    offset: number;
    limit: number;
    search?: string;
    include_archived?: boolean;
    sort_by?: ProcessSortField;
    sort_order?: 'asc' | 'desc';
}

export type ProcessSortField = 'f_code' | 'l0_area' | 'l1_process' | 'owner' | 'created_at';

export interface ProcessListResponse {
    items: Process[];
    total: number;
    offset: number;
    limit: number;
    capabilities?: ProcessListCapabilities | null;
}
