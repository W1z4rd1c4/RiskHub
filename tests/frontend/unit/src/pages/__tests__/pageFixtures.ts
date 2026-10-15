import type { Asset, AssetDerived } from '@/types/asset';
import type { ApprovalRequest } from '@/types/approval';
import type { Risk, RiskCapabilities } from '@/types/risk';
import type { Control, ControlCapabilities } from '@/types/control';
import type { Vendor, VendorCapabilities } from '@/types/vendor';
import type { Issue, IssueCapabilities } from '@/types/issue';
import type { KeyRiskIndicator, KRICapabilities } from '@/types/kri';

const timestamp = '2026-07-15T10:00:00Z';

export function riskCapabilities(overrides: Partial<RiskCapabilities> = {}): RiskCapabilities {
    return {
        can_read: false,
        can_update: false,
        can_update_sensitive_fields: false,
        can_request_update_approval: false,
        can_archive_immediately: false,
        can_request_archive_approval: false,
        can_restore: false,
        can_send_questionnaire: false,
        can_create_kri: false,
        can_create_linked_control: false,
        can_link_controls: false,
        can_unlink_controls: false,
        can_view_linked_controls: false,
        can_view_linked_vendors: false,
        can_create_issue: false,
        has_pending_delete_approval: false,
        has_pending_update_approval: false,
        requires_privileged_update_approval: false,
        requires_privileged_delete_approval: false,
        ...overrides,
    };
}

export function controlCapabilities(overrides: Partial<ControlCapabilities> = {}): ControlCapabilities {
    return {
        can_read: false,
        can_update: false,
        can_update_sensitive_fields: false,
        can_request_update_approval: false,
        can_archive_immediately: false,
        can_request_archive_approval: false,
        can_restore: false,
        can_log_execution: false,
        can_view_executions: false,
        can_link_risk: false,
        can_unlink_risk: false,
        can_view_linked_risks: false,
        can_view_linked_vendors: false,
        can_create_issue: false,
        has_pending_delete_approval: false,
        has_pending_update_approval: false,
        requires_privileged_update_approval: false,
        requires_privileged_delete_approval: false,
        is_archived: false,
        is_executable: false,
        ...overrides,
    };
}

export function vendorCapabilities(overrides: Partial<VendorCapabilities> = {}): VendorCapabilities {
    return {
        can_read: false,
        can_update: false,
        can_manage_accountability: false,
        can_archive: false,
        can_restore: false,
        can_create_linked_risk: false,
        can_create_linked_control: false,
        can_create_linked_kri: false,
        can_link_risk: false,
        can_link_control: false,
        can_link_kri: false,
        can_view_linked_risks: false,
        can_view_linked_controls: false,
        can_view_linked_kris: false,
        can_create_issue: false,
        can_view_contracts: false,
        can_manage_contracts: false,
        can_view_sub_outsourcing: false,
        can_manage_sub_outsourcing: false,
        can_view_asset_links: false,
        can_manage_asset_links: false,
        can_manage_process_links: false,
        ...overrides,
    };
}

export function issueCapabilities(overrides: Partial<IssueCapabilities> = {}): IssueCapabilities {
    return {
        can_read: false,
        can_update: false,
        can_change_department: false,
        can_assign_owner: false,
        can_clear_owner: false,
        can_start_remediation: false,
        can_update_remediation_progress: false,
        can_mark_remediation_blocked: false,
        can_mark_remediation_completed: false,
        can_request_exception: false,
        can_approve_exception: false,
        can_revoke_exception: false,
        can_close: false,
        can_link_risk: false,
        can_link_control: false,
        can_link_execution: false,
        can_link_kri: false,
        can_link_vendor: false,
        can_unlink_entities: false,
        can_view_risk_contexts: false,
        can_view_vendor_contexts: false,
        can_use_department_lookup: false,
        can_use_owner_lookup: false,
        is_owner: false,
        is_closed: false,
        has_active_exception: false,
        has_pending_exception_request: false,
        ...overrides,
    };
}

export function kriCapabilities(overrides: Partial<KRICapabilities> = {}): KRICapabilities {
    return {
        can_read: false,
        can_update: false,
        can_update_sensitive_fields: false,
        can_request_update_approval: false,
        can_archive_immediately: false,
        can_request_archive_approval: false,
        can_restore: false,
        can_submit_value: false,
        can_submit_backdated_value: false,
        can_request_value_submission_approval: false,
        can_view_history: false,
        can_request_history_correction: false,
        can_apply_history_correction_immediately: false,
        can_link_vendors: false,
        can_unlink_vendors: false,
        can_view_linked_vendors: false,
        can_create_issue: false,
        has_pending_delete_approval: false,
        has_pending_update_approval: false,
        has_pending_value_submission_approval: false,
        has_pending_history_correction_approval: false,
        requires_privileged_update_approval: false,
        requires_privileged_delete_approval: false,
        ...overrides,
    };
}

export function riskFixture(overrides: Omit<Partial<Risk>, 'capabilities'> & { capabilities?: Partial<RiskCapabilities> | null } = {}): Risk {
    return {
        id: 1, risk_id_code: 'R-001', name: 'Risk', process: 'Operations', risk_type: 'operational', description: '', gross_probability: 3, gross_impact: 3, gross_score: 9, net_probability: 2, net_impact: 2, net_score: 4, status: 'active', is_archived: false, is_priority: false, created_at: timestamp, updated_at: timestamp,
        ...overrides,
        capabilities: overrides.capabilities == null ? overrides.capabilities : riskCapabilities(overrides.capabilities),
    };
}

export function controlFixture(overrides: Omit<Partial<Control>, 'capabilities'> & { capabilities?: Partial<ControlCapabilities> | null } = {}): Control {
    return {
        id: 1, name: 'Control', description: '', control_form: 'manual', frequency: 'monthly', risk_level: 3, status: 'active', is_archived: false, created_at: timestamp, updated_at: timestamp,
        ...overrides,
        capabilities: overrides.capabilities == null ? overrides.capabilities : controlCapabilities(overrides.capabilities),
    };
}

export function vendorFixture(overrides: Omit<Partial<Vendor>, 'capabilities'> & { capabilities?: Partial<VendorCapabilities> | null } = {}): Vendor {
    return {
        id: 1, name: 'Vendor', process: 'Operations', outsourcing_owner_user_id: 7, owner_orphaned: false, ownership_status: 'assigned', linked_risks: [], vendor_type: 'ict', risk_score_1_5: 3, supports_important_core_insurance_function: false, dora_relevant: false, is_significant_vendor: false, has_alternative_providers: false, is_archived: false, created_at: timestamp, updated_at: timestamp,
        ...overrides,
        capabilities: overrides.capabilities == null ? overrides.capabilities : vendorCapabilities(overrides.capabilities),
    };
}

export function issueFixture(overrides: Omit<Partial<Issue>, 'capabilities'> & { capabilities?: Partial<IssueCapabilities> | null } = {}): Issue {
    return {
        id: 1, title: 'Issue', severity: 'medium', status: 'open', source_type: 'manual', source_id: null, department_id: 1, department_name: null, owner_user_id: null, owner_user_name: null, opened_at: timestamp, due_at: null, closed_at: null, created_at: timestamp, updated_at: timestamp, risk_contexts: [], vendor_contexts: [], description: null, created_by_id: null, created_by_name: null, validation_note: null, links: [], remediation_plan: null, exceptions: [],
        ...overrides,
        capabilities: overrides.capabilities == null ? overrides.capabilities : issueCapabilities(overrides.capabilities),
    };
}

export function kriFixture(overrides: Omit<Partial<KeyRiskIndicator>, 'capabilities'> & { capabilities?: Partial<KRICapabilities> | null } = {}): KeyRiskIndicator {
    return {
        id: 1, risk_id: 1, metric_name: 'Indicator', description: '', current_value: 3, lower_limit: 0, upper_limit: 5, unit: '%', breach_status: 'within', last_updated: timestamp, created_at: timestamp, frequency: 'monthly',
        ...overrides,
        capabilities: overrides.capabilities == null ? overrides.capabilities : kriCapabilities(overrides.capabilities),
    };
}

export function approvalFixture(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
    return {
        id: 1, resource_type: 'asset', resource_id: 1, resource_name: 'Resource', action_type: 'edit',
        pending_changes: null, status: 'pending', reason: 'Review change', requested_by_id: 1,
        requested_by_name: null, requested_by_email: null, resolved_by_id: null, resolved_by_name: null,
        resolved_at: null, resolution_notes: null, created_at: timestamp, can_approve: false, can_reject: false,
        ...overrides,
    };
}

export function assetDerivedFixture(overrides: Partial<AssetDerived> = {}): AssetDerived {
    return {
        h_rank: 0, article8_classification: 'non_critical', cif: 'no', cif_process_count: 0, cif_process_names: [],
        spof: 'no', external_dependency: 'no', legacy: 'no', linked_process_count: 0, linked_vendor_count: 0,
        linked_asset_names: [], vendor_names: [], ict_service_codes: [], contract_references: [], is_complete: true,
        inputs: { reference_date: '2026-07-15', threshold_low_score: 2, threshold_medium_score: 3, threshold_high_score: 4,
            rank_primary_process_criticality: 0, rank_score_criticality: 0, rank_preliminary_criticality: 0,
            rank_business_criticality: 0, rank_cif_floor: 0, missing_for_completeness: [] },
        ...overrides,
    };
}

export function assetFixture(overrides: Partial<Asset> = {}): Asset {
    return { id: 1, name: 'Asset', business_owner_orphaned: false, ict_owner_orphaned: false, ownership_status: 'assigned',
        is_archived: false, created_at: timestamp, updated_at: timestamp, ...overrides };
}
