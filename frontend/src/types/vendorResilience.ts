export type VendorPlanStatus = 'not_started' | 'in_progress' | 'complete';

export interface VendorExitPlan {
    status: VendorPlanStatus;
    plan_reference?: string | null;
    notes?: string | null;
    last_reviewed_at?: string | null;
    last_tested_at?: string | null;
}

export interface VendorContingencyPlan {
    max_tolerable_outage_hours?: number | null;
    impact_confidentiality: boolean;
    impact_integrity: boolean;
    impact_authenticity: boolean;
    impact_availability: boolean;

    status: VendorPlanStatus;
    plan_reference?: string | null;
    notes?: string | null;
    last_reviewed_at?: string | null;
    last_tested_at?: string | null;
}

export interface VendorResilience {
    vendor_id: number;
    is_required: boolean;
    contingency_required: boolean;

    exit_plan?: VendorExitPlan | null;
    contingency_plan?: VendorContingencyPlan | null;

    missing_exit_plan: boolean;
    missing_contingency_plan: boolean;
}

export interface VendorResilienceUpdate {
    exit_plan?: VendorExitPlan | null;
    contingency_plan?: VendorContingencyPlan | null;
}

