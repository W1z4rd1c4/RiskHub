import { describe, expect, it } from 'vitest';

import {
    approvalScenarioSchema,
    governedMutationReadSchema,
    notificationPreferencesSchema,
    processApprovalQueuedResponseSchema,
    processCapabilitiesSchema,
    processPendingChangeSchema,
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
            capabilities: { can_view_diff: true, can_cancel: true },
        })).toMatchObject({ status: 'pending', approval_id: 41 });
    });

    it('accepts governed review and immutable scenario metadata', () => {
        expect(governedMutationReadSchema.parse({
            proposal_id: 'proposal-41',
            proposal_version: 2,
            mutation_kind: 'process_edit',
            before: { l1_process: 'Payments' },
            after: { l1_process: 'Payments v2' },
            derived_impact: derivedImpact,
            impacted_resources: [{
                resource_type: 'process',
                resource_name: 'F7 — Payments',
            }],
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

    it('rejects raw impacted-resource IDs at the frontend contract boundary', () => {
        expect(governedMutationReadSchema.safeParse({
            proposal_id: 'proposal-unsafe',
            proposal_version: 1,
            mutation_kind: 'process_edit',
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
