import { describe, expect, it } from 'vitest';

import {
    approvalScenarioSchema,
    approvalRequestSchema,
    governedMutationReadSchema,
    notificationPreferencesSchema,
    processApprovalQueuedResponseSchema,
    processCapabilitiesSchema,
    processPendingChangeSchema,
    processPendingCreationSchema,
} from '@/services/api/schemas';

const derivedImpact = {
    before: { cif: 'no', criticality_class: 'medium' },
    after: { cif: 'yes', criticality_class: 'critical' },
};

describe('protected Process API schemas', () => {
    it('requires the backend-projected protected-change routing switch', () => {
        const capabilities = {
            can_read: true,
            can_update: true,
            can_archive: true,
            can_restore: false,
            protected_change_requires_approval: false,
            can_request_change: true,
            can_cancel_pending_change: false,
            has_pending_change: false,
            business_edit_blocked: false,
        };

        expect(processCapabilitiesSchema.parse(capabilities).protected_change_requires_approval).toBe(false);
        const { protected_change_requires_approval: _omitted, ...missingRoutingState } = capabilities;
        expect(processCapabilitiesSchema.safeParse(missingRoutingState).success).toBe(false);
    });

    it('accepts the 202 proposal and active pending projection contracts', () => {
        expect(processApprovalQueuedResponseSchema.parse({
            status: 'approval_required',
            message: 'Submitted',
            approval_id: 41,
            action_type: 'edit',
            pending_fields: ['l1_process'],
            proposal_id: 'proposal-41',
            proposal_version: 2,
        })).toMatchObject({ proposal_id: 'proposal-41', proposal_version: 2 });

        expect(processPendingChangeSchema.parse({
            approval_id: 41,
            proposal_id: 'proposal-41',
            proposal_version: 2,
            status: 'pending',
            requested_at: '2026-07-16T00:00:00Z',
            requested_by_name: 'Alice',
            reason: 'Improve resilience',
            before: { l1_process: 'Payments' },
            after: { l1_process: 'Payments v2' },
            derived_impact: derivedImpact,
            capabilities: {
                can_view_diff: true,
                can_cancel: true,
            },
        })).toMatchObject({ status: 'pending', approval_id: 41 });
    });

    it('accepts protected creation and safe non-operational pending creation contracts', () => {
        expect(processApprovalQueuedResponseSchema.parse({
            status: 'approval_required',
            message: 'Submitted',
            approval_id: 85,
            action_type: 'create',
            pending_fields: ['l1_process'],
            proposal_id: 'proposal-create-85',
            proposal_version: 1,
        })).toMatchObject({ action_type: 'create', approval_id: 85 });

        expect(processPendingCreationSchema.parse({
            approval_id: 85,
            proposal_id: 'proposal-create-85',
            proposal_version: 1,
            status: 'pending_creation',
            requested_at: '2026-07-17T00:00:00Z',
            requested_by_name: 'Alice',
            reason: 'New critical function',
            proposed: {
                l0_area: 'Operations',
                l1_process: 'Critical settlement',
                process_owner: 'Alice Owner',
                owning_department: 'Operations',
            },
            derived: { cif: 'yes', criticality_class: 'critical' },
            capabilities: {
                can_view_diff: true,
                can_cancel: true,
                is_requester: true,
                can_resolve: false,
            },
        })).toMatchObject({ status: 'pending_creation', approval_id: 85 });

        expect(processPendingCreationSchema.safeParse({
            approval_id: 85,
            proposal_id: 'unsafe',
            proposal_version: 1,
            status: 'pending_creation',
            requested_at: '2026-07-17T00:00:00Z',
            requested_by_name: 'Alice',
            reason: 'Unsafe projection',
            proposed: {
                l1_process: 'Critical settlement',
                process_owner_user_id: 7315,
            },
            derived: { cif: 'yes', criticality_class: 'critical' },
            capabilities: {
                can_view_diff: true,
                can_cancel: true,
                is_requester: true,
                can_resolve: false,
            },
        }).success).toBe(false);

        expect(approvalRequestSchema.parse({
            id: 85,
            resource_type: 'process',
            resource_id: null,
            resource_name: 'Critical settlement',
            action_type: 'create',
            pending_changes: {},
            governed_mutation: {
                proposal_id: 'proposal-create-85',
                proposal_version: 1,
                mutation_kind: 'process.create',
                before: {},
                after: { l1_process: 'Critical settlement' },
                derived_impact: {
                    before: null,
                    after: { cif: 'yes', criticality_class: 'critical' },
                },
                impacted_resources: [],
                relationship_change: null,
            },
            status: 'pending',
            reason: 'New critical function',
            requested_by_id: 7,
            requested_by_name: 'Alice',
            requested_by_email: 'alice@example.test',
            resolved_by_id: null,
            resolved_by_name: null,
            resolved_at: null,
            resolution_notes: null,
            created_at: '2026-07-17T00:00:00Z',
            can_approve: false,
            can_reject: false,
            capabilities: {
                can_read: true,
                can_approve: false,
                can_reject: false,
                can_cancel: true,
                can_cancel_as_requester: true,
                can_cancel_as_resolver: false,
                can_view_pending_changes: true,
                can_view_resolution_notes: false,
                can_inspect_side_effects: false,
                is_requester: true,
                is_primary_approver: false,
                is_privileged_resolver: false,
                is_pending: true,
                requires_privileged_resolution: false,
                would_apply_side_effects_on_approve: false,
            },
        })).toMatchObject({ resource_id: null, action_type: 'create' });
    });

    it('accepts governed review and immutable scenario metadata', () => {
        expect(governedMutationReadSchema.parse({
            proposal_id: 'proposal-41',
            proposal_version: 2,
            mutation_kind: 'process.edit',
            before: { l1_process: 'Payments' },
            after: { l1_process: 'Payments v2' },
            derived_impact: derivedImpact,
            impacted_resources: [{
                resource_type: 'process',
                resource_name: 'F7 — Payments',
            }],
            relationship_change: null,
        }).impacted_resources?.[0]?.resource_name).toBe('F7 — Payments');

        expect(approvalScenarioSchema.parse({
            id: 84,
            key: 'protected_process_edit',
            display_name: 'Protected Process mutations',
            description: 'Protected Process edit workflow',
            requires_approval: true,
            approver_roles: ['risk_manager', 'cro'],
            fixed_policy: true,
            updated_at: '2026-07-16T00:00:00Z',
            updated_by_name: null,
        }).fixed_policy).toBe(true);
    });

    it('accepts the safe relationship projection and rejects replay identifiers', () => {
        const relationshipMutation = {
            proposal_id: 'proposal-link-85',
            proposal_version: 1,
            mutation_kind: 'process.link.asset.update',
            before: { relationship: { related_resource_id: 7315 } },
            after: { relationship: { related_resource_id: 7315 } },
            derived_impact: {
                processes: [{
                    resource_name: 'F7 — Payments',
                    before: { cif: 'yes', criticality_class: 'high' },
                    after: { cif: 'yes', criticality_class: 'critical' },
                }],
            },
            impacted_resources: [{ resource_type: 'process', resource_name: 'F7 — Payments' }],
            relationship_change: {
                target_resource_type: 'asset',
                target_resource_name: 'Claims platform',
                action: 'update',
                before: { significance: 'supporting', is_primary: false },
                after: { significance: 'critical', is_primary: true },
            },
        };

        expect(governedMutationReadSchema.parse(relationshipMutation).relationship_change)
            .toMatchObject({ target_resource_name: 'Claims platform', action: 'update' });
        expect(governedMutationReadSchema.safeParse({
            ...relationshipMutation,
            relationship_change: {
                ...relationshipMutation.relationship_change,
                before: { related_resource_id: '7315' },
            },
        }).success).toBe(false);
        expect(governedMutationReadSchema.safeParse({
            ...relationshipMutation,
            derived_impact: {
                processes: [{
                    resource_id: 7,
                    resource_name: 'F7 — Payments',
                    before: { cif: 'yes', criticality_class: 'high' },
                    after: { cif: 'yes', criticality_class: 'critical' },
                }],
            },
        }).success).toBe(false);
    });

    it('rejects raw impacted-resource IDs at the frontend contract boundary', () => {
        expect(governedMutationReadSchema.safeParse({
            proposal_id: 'proposal-unsafe',
            proposal_version: 1,
            mutation_kind: 'process.edit',
            before: {},
            after: {},
            derived_impact: derivedImpact,
            impacted_resources: [{
                resource_type: 'process',
                resource_id: 7315,
                resource_name: 'Payments',
            }],
        }).success).toBe(false);
    });

    it('fails closed for unknown mutation kinds, resource types, and mismatched link envelopes', () => {
        const editMutation = {
            proposal_id: 'proposal-edit-85',
            proposal_version: 1,
            mutation_kind: 'process.edit',
            before: { l1_process: 'Payments' },
            after: { l1_process: 'Payments v2' },
            derived_impact: derivedImpact,
            impacted_resources: [{ resource_type: 'process', resource_name: 'F7 — Payments' }],
            relationship_change: null,
        };
        const relationshipMutation = {
            proposal_id: 'proposal-link-85',
            proposal_version: 1,
            mutation_kind: 'process.link.asset.add',
            before: { relationship: null },
            after: { relationship: { linked: true } },
            derived_impact: {
                processes: [{
                    resource_name: 'F7 — Payments',
                    before: { cif: 'yes', criticality_class: 'high' },
                    after: { cif: 'yes', criticality_class: 'high' },
                }],
            },
            impacted_resources: [{ resource_type: 'process', resource_name: 'F7 — Payments' }],
            relationship_change: {
                target_resource_type: 'asset',
                target_resource_name: 'Claims platform',
                action: 'add',
                before: {},
                after: { linked: true },
            },
        };

        expect(governedMutationReadSchema.safeParse({
            ...editMutation,
            mutation_kind: 'process.link.future.add',
        }).success).toBe(false);
        expect(governedMutationReadSchema.safeParse({
            ...editMutation,
            impacted_resources: [{ resource_type: 'asset', resource_name: 'Claims platform' }],
        }).success).toBe(false);
        expect(governedMutationReadSchema.safeParse({
            ...relationshipMutation,
            relationship_change: {
                ...relationshipMutation.relationship_change,
                target_resource_type: 'vendor',
            },
        }).success).toBe(false);
        expect(governedMutationReadSchema.safeParse({
            ...relationshipMutation,
            relationship_change: {
                ...relationshipMutation.relationship_change,
                action: 'remove',
            },
        }).success).toBe(false);
        expect(governedMutationReadSchema.safeParse({
            ...editMutation,
            primary_resource_id: 7315,
        }).success).toBe(false);
    });

    it('requires both governed notification preferences', () => {
        expect(notificationPreferencesSchema.parse({
            approval_pending: true,
            approval_resolved: true,
            approval_cancelled: true,
            governed_approval_action_required: true,
            governed_approval_request_updates: true,
            kri_due_soon: true,
            kri_due_tomorrow: true,
            kri_overdue: true,
            kri_near_breach: true,
            kri_breach_detected: true,
            questionnaire_sent: true,
            questionnaire_due_soon: true,
            questionnaire_overdue: true,
            questionnaire_submitted: true,
            questionnaire_clarification_requested: true,
        }).governed_approval_request_updates).toBe(true);
    });
});
