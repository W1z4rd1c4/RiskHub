import { describe, expect, it } from 'vitest';

import { approvalRequestSchema, threatSchema } from '@/services/api/schemas';

const threatWithPendingChange = {
    id: 88,
    governance_version: 3,
    name: 'Credential theft',
    threat_steward_user_id: 17,
    threat_steward: {
        name: 'Clara Security',
        email: 'clara@example.test',
        role_name: 'ciso',
        department_name: 'Security',
    },
    stewardship_status: 'assigned',
    is_archived: false,
    capabilities: {
        can_read: true,
        can_update: false,
        can_archive: false,
        can_restore: false,
        has_pending_change: true,
        business_edit_blocked: true,
        can_cancel_pending_change: true,
    },
    pending_change: {
        approval_id: 88,
        proposal_id: 'proposal-threat-steward-88',
        proposal_version: 1,
        status: 'pending',
        requested_at: '2026-07-30T10:00:00Z',
        requested_by_name: 'Alice Requester',
        reason: 'Transfer stewardship',
        generic_label: 'accountability_reassignment',
        mutation_kind: 'threat.edit',
        before: { threat_steward: 'Clara Security' },
        after: { threat_steward: 'Diego Security' },
        derived_impact: { before: {}, after: {} },
        impacted_resources: [{
            resource_type: 'threat',
            resource_name: 'Restricted Threat',
        }],
        capabilities: {
            can_view_diff: true,
            can_cancel: true,
        },
    },
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-30T10:00:00Z',
};

describe('Threat approval schema', () => {
    it('parses the exact authorized Threat detail pending-change overlay', () => {
        const parsed = threatSchema.parse(threatWithPendingChange);

        expect(parsed.pending_change?.before).toEqual({
            threat_steward: 'Clara Security',
        });
        expect(parsed.pending_change?.after).toEqual({
            threat_steward: 'Diego Security',
        });
        expect(parsed.pending_change?.derived_impact).toEqual({
            before: {},
            after: {},
        });
    });

    it('rejects raw Steward identifiers and fabricated derived values in the overlay', () => {
        expect(() => threatSchema.parse({
            ...threatWithPendingChange,
            pending_change: {
                ...threatWithPendingChange.pending_change,
                before: {
                    threat_steward: 'Clara Security',
                    threat_steward_user_id: 17,
                },
                derived_impact: {
                    before: { cif: 'no' },
                    after: { cif: 'yes' },
                },
            },
        })).toThrow();
    });

    it('parses the exact redacted pending-change overlay without cancellation', () => {
        const parsed = threatSchema.parse({
            ...threatWithPendingChange,
            capabilities: {
                ...threatWithPendingChange.capabilities,
                can_cancel_pending_change: false,
            },
            pending_change: {
                approval_id: null,
                proposal_id: null,
                proposal_version: null,
                status: 'pending',
                requested_at: '2026-07-30T10:00:00Z',
                requested_by_name: null,
                reason: '',
                generic_label: 'accountability_reassignment',
                mutation_kind: null,
                before: {},
                after: {},
                derived_impact: {},
                impacted_resources: [],
                capabilities: {
                    can_view_diff: false,
                    can_cancel: false,
                },
            },
        });

        expect(parsed.pending_change?.capabilities.can_view_diff).toBe(false);
        expect(parsed.pending_change?.approval_id).toBeNull();
    });

    it('parses a governed threat.edit approval request', () => {
        const parsed = approvalRequestSchema.parse({
            id: 88,
            resource_type: 'threat',
            resource_id: 88,
            resource_name: 'Credential theft',
            action_type: 'edit',
            pending_changes: {
                threat_steward: { old: 'Clara Security', new: 'Diego Security' },
            },
            governed_mutation: {
                proposal_id: 'proposal-threat-steward-88',
                proposal_version: 1,
                mutation_kind: 'threat.edit',
                before: { threat_steward: 'Clara Security' },
                after: { threat_steward: 'Diego Security' },
                derived_impact: {
                    before: {},
                    after: {},
                },
                impacted_resources: [{
                    resource_type: 'threat',
                    resource_name: 'Restricted Threat',
                }],
                relationship_change: null,
            },
            status: 'pending',
            reason: 'Transfer stewardship',
            requested_by_id: 7,
            requested_by_name: 'Requester',
            requested_by_email: 'requester@example.test',
            resolved_by_id: null,
            resolved_by_name: null,
            resolved_at: null,
            resolution_notes: null,
            created_at: '2026-07-30T10:00:00Z',
            can_approve: false,
            can_reject: false,
        });

        expect(parsed.resource_type).toBe('threat');
        expect(parsed.governed_mutation?.mutation_kind).toBe('threat.edit');
        expect(parsed.governed_mutation?.derived_impact).toEqual({ before: {}, after: {} });
        expect(parsed.governed_mutation?.impacted_resources).toEqual([{
            resource_type: 'threat',
            resource_name: 'Restricted Threat',
        }]);
    });
});
