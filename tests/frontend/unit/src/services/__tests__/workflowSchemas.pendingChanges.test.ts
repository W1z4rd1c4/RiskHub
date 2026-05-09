import { describe, expect, it } from 'vitest';

import { approvalRequestSchema } from '@/services/api/schemas/workflow';

const baseApproval = {
    id: 1,
    resource_type: 'kri',
    resource_id: 2,
    resource_name: 'Pending change fixture',
    action_type: 'edit',
    status: 'pending',
    reason: 'Contract test',
    requested_by_id: 3,
    requested_by_name: 'Requester',
    requested_by_email: 'requester@example.com',
    resolved_by_id: null,
    resolved_by_name: null,
    resolved_at: null,
    resolution_notes: null,
    created_at: '2026-05-09T10:00:00Z',
    can_approve: true,
    can_reject: true,
} as const;

const producerPendingChanges = [
    { name: { old: 'Old risk', new: 'New risk' }, category: { old: null, new: 'Operational' } },
    { owner_id: { old: 1, new: 2 }, department_id: { old: 3, new: 4 } },
    { control_name: { old: 'Manual', new: 'Automated' }, status: { old: 'draft', new: 'active' } },
    { current_value: { old: 50, new: 64 }, period_end: { old: null, new: '2026-03-31' }, recorded_at: { old: null, new: '2026-04-10T12:00:00Z' } },
    { history_entry_id: 42, old_value: 50, new_value: 64, reason: 'Correction', period_end: '2026-03-31' },
    { metric_name: { old: 'Availability', new: 'Uptime' }, lower_limit: { old: 95, new: 97 } },
    { risk_id: { old: 10, new: 11 }, effectiveness: { old: 'medium', new: 'high' } },
    { control_id: { old: 12, new: 13 }, notes: { old: null, new: 'Linked to control' } },
    { vendor_id: { old: null, new: 7 }, target_id: { old: null, new: 22 } },
    { action_type: { old: 'delete', new: 'delete' }, is_archived: { old: false, new: true } },
    { scenario_roles: { old: ['risk_owner'], new: ['risk_manager', 'cro'] } },
    { requires_approval: { old: true, new: false }, approver_roles: { old: ['cro'], new: [] } },
    { reason: 'Scalar compatibility field', requested_by: 3 },
];

describe('workflow approval schemas', () => {
    it('accepts pending_changes shapes emitted by all current producers', () => {
        expect(producerPendingChanges).toHaveLength(13);

        for (const pending_changes of producerPendingChanges) {
            expect(() => approvalRequestSchema.parse({ ...baseApproval, pending_changes })).not.toThrow();
        }
    });
});
