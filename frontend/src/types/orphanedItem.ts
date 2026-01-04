export interface OrphanedItem {
    id: number;
    item_type: "risk" | "control" | "kri";
    item_id: number;
    item_name: string;
    item_description: string | null;
    item_identifier: string;
    department_name: string | null;
    previous_owner_name: string;
    previous_owner_email: string;
    orphaned_at: string;
    status: "pending" | "resolved";
}

export interface OrphanStats {
    risk_count: number;
    control_count: number;
    kri_count: number;
    total_count: number;
}

export interface ResolveOrphanRequest {
    new_owner_id?: number;  // Optional for KRIs (they inherit owner from risk)
    department_id?: number;
    target_risk_id?: number;
}
