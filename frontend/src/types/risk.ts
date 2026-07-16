// Risk types matching backend schemas from OS 18 Řízení rizik
// Now supports arbitrary types configured in Risk Hub (not just S/O)

import type { ControlMonitoringFields } from './control';
import type { CollectionFacetOption, CollectionListResponse, CollectionSort } from './collection';
import type { KeyRiskIndicator } from './kri';
import type { LinkedVendorSummary } from './vendorLink';

export type RiskType = string;
export const RiskTypeCodes = {
    STRATEGIC: 'strategic',
    OPERATIONAL: 'operational',
} as const;

export type RiskStatus = 'active' | 'emerging';
export const RiskStatus = {
    ACTIVE: 'active' as RiskStatus,
    EMERGING: 'emerging' as RiskStatus,
};

export type ControlEffectiveness = 'high' | 'medium' | 'low';
export const ControlEffectiveness = {
    HIGH: 'high' as ControlEffectiveness,
    MEDIUM: 'medium' as ControlEffectiveness,
    LOW: 'low' as ControlEffectiveness,
};

export interface RiskCapabilities {
    can_read: boolean;
    can_update: boolean;
    can_update_sensitive_fields: boolean;
    can_request_update_approval: boolean;
    can_archive_immediately: boolean;
    can_request_archive_approval: boolean;
    can_restore: boolean;
    can_send_questionnaire: boolean;
    can_create_kri: boolean;
    can_create_linked_control: boolean;
    can_link_controls: boolean;
    can_unlink_controls: boolean;
    can_view_linked_controls: boolean;
    can_view_linked_vendors: boolean;
    can_create_issue: boolean;
    has_pending_delete_approval: boolean;
    has_pending_update_approval: boolean;
    requires_privileged_update_approval: boolean;
    requires_privileged_delete_approval: boolean;
}

export interface Risk {
    id: number;
    risk_id_code: string;
    name: string;
    process: string;
    subprocess?: string | null;
    risk_type: RiskType;
    category?: string | null;
    description: string;
    department_id?: number | null;
    owner_id?: number | null;

    // Gross risk (before controls)
    gross_probability: number;
    gross_impact: number;
    gross_score: number;

    // Net risk (after controls)
    net_probability: number;
    net_impact: number;
    net_score: number;

    status: RiskStatus;
    is_archived: boolean;
    archived_at?: string | null;
    archived_by_id?: number | null;
    is_priority: boolean;

    // KRI thresholds (legacy) - string for form input
    kri_indicator?: string;
    kri_threshold_green?: string;
    kri_threshold_yellow?: string;
    kri_threshold_red?: string;

    // ICT Register acceptance governance (issue #47) — entered, always optional;
    // the required-together rule above tolerance is a DQ finding, not a write block.
    acceptance_approver?: string | null;
    acceptance_justification?: string | null;
    acceptance_date?: string | null;

    created_at: string;
    updated_at: string;

    // Relationships
    kris?: KeyRiskIndicator[];
    owner?: {
        id: number;
        name: string;
        email: string;
    } | null;
    department?: {
        id: number;
        name: string;
        code: string;
    } | null;
    capabilities?: RiskCapabilities | null;
}

export interface RiskSummary {
    id: number;
    risk_id_code: string;
    name: string;
    process: string;
    subprocess?: string | null;
    risk_type: RiskType;
    category?: string | null;
    description: string;
    gross_score: number;
    gross_probability: number;
    gross_impact: number;
    net_score: number;
    status: RiskStatus;
    is_archived: boolean;
    is_priority: boolean;
    department_id?: number | null;
    department_name?: string | null;
    owner_id?: number | null;
    owner_name?: string | null;
    kri_count?: number;
    has_breach?: boolean;
    control_count?: number;
    linked_vendors?: LinkedVendorSummary[];
    capabilities?: RiskCapabilities | null;
}

export interface RiskListCapabilities {
    can_export?: boolean;
    can_create?: boolean;
    can_view_vendor_contexts?: boolean;
}

export interface RiskFacets {
    status?: CollectionFacetOption[];
    risk_type?: CollectionFacetOption[];
    is_priority?: CollectionFacetOption[];
    has_breach?: CollectionFacetOption[];
    process?: CollectionFacetOption[];
    category?: CollectionFacetOption[];
    ict_linked?: CollectionFacetOption[];
    above_tolerance?: CollectionFacetOption[];
    response?: CollectionFacetOption[];
    gross_probability?: CollectionFacetOption[];
    gross_impact?: CollectionFacetOption[];
    gross_band?: CollectionFacetOption[];
    net_band?: CollectionFacetOption[];
    department?: CollectionFacetOption[];
}

export interface RiskListParams {
    offset?: number;
    limit?: number;
    search?: string;
    lifecycle?: 'active' | 'archived' | 'all';
    status?: RiskStatus;
    risk_type?: string;
    is_priority?: boolean;
    has_breach?: boolean;
    min_net_score?: number;
    process?: string;
    category?: string;
    ict_linked?: boolean;
    above_tolerance?: boolean;
    response?: 'acceptance';
    gross_probability?: number;
    gross_impact?: number;
    gross_band?: string;
    net_band?: string;
    department_id?: number;
    sort?: CollectionSort | null;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    view?: string;
    group_by?: string;
    group_value?: string;
}

export interface RiskCreate {
    risk_id_code?: string;  // Auto-generated by backend if not provided
    name: string;
    process: string;
    subprocess?: string;
    risk_type: RiskType;
    category?: string;
    description: string;
    department_id?: number;
    owner_id?: number;
    gross_probability: number;
    gross_impact: number;
    net_probability: number;
    net_impact: number;
    status?: RiskStatus;
    is_priority?: boolean;
    acceptance_approver?: string | null;
    acceptance_justification?: string | null;
    acceptance_date?: string | null;
}

export type RiskUpdate = Partial<RiskCreate>;

export interface RiskControlLink {
    id: number;
    control_id: number;
    risk_id: number;
    effectiveness: ControlEffectiveness;
    notes?: string | null;
    created_at: string;
    control?: ControlMonitoringFields & {
        id: number;
        name: string;
        frequency: string;
        risk_level: number;
        status: string;
        is_archived: boolean;
    };
    risk?: {
        id: number;
        risk_id_code: string;
        process: string;
        gross_score: number;
        net_score: number;
        is_archived: boolean;
    };
}

export type RiskListResponse = CollectionListResponse<RiskSummary, RiskListCapabilities> & {
    facets?: RiskFacets | null;
};
