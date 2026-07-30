import { describe, expect, it } from 'vitest';

import {
    approvalScenarioSchema,
    assetSchema,
    approvalListResponseSchema,
    approvalRequestSchema,
    governedMutationReadSchema,
    notificationListResponseSchema,
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
    it.each([
        'governed_approval_action_required',
        'governed_approval_request_updates',
    ] as const)('parses %s notifications returned by the inbox API', (type) => {
        const parsed = notificationListResponseSchema.parse({
            items: [{
                id: 86,
                type,
                title: 'Protected Asset approval',
                message: 'Review required',
                resource_type: 'approval',
                resource_id: 186,
                is_read: false,
                created_at: '2026-07-19T10:00:00Z',
            }],
            total: 1,
            skip: 0,
            limit: 25,
            unread_count: 1,
        });
        expect(parsed.items[0]?.type).toBe(type);
    });

    it('validates typed Asset pending-change runtime envelopes and rejects raw identifiers', () => {
        const pendingChange = {
            approval_id: 86,
            proposal_id: '4c17a671-5b7d-4ed6-a9bb-4ab184ed1ed1',
            proposal_version: 1,
            status: 'pending',
            requested_at: '2026-07-19T10:00:00Z',
            requested_by_name: 'Asset Owner',
            reason: 'Review protected Asset dependency',
            generic_label: 'protected_asset_change',
            mutation_kind: 'asset.link.asset.add',
            before: { relationship: null },
            after: { relationship: { dependency_type: 'Datová' } },
            derived_impact: {
                assets: [{
                    resource_name: 'Payments platform',
                    before: { cif: 'no', resulting_criticality: 'medium' },
                    after: { cif: 'yes', resulting_criticality: 'critical' },
                }],
            },
            impacted_resources: [{ resource_type: 'asset', resource_name: 'Payments platform' }],
            relationship_change: {
                target_resource_type: 'asset',
                target_resource_name: 'Customer ledger',
                action: 'add',
                before: {},
                after: { dependency_type: 'Datová' },
            },
            capabilities: { can_view_diff: true, can_cancel: true },
        };
        const asset = {
            id: 75,
            name: 'Payments platform',
            business_owner_orphaned: false,
            ict_owner_orphaned: false,
            ownership_status: 'assigned',
            is_archived: false,
            pending_change: pendingChange,
            created_at: '2026-07-19T09:00:00Z',
            updated_at: '2026-07-19T09:00:00Z',
        };

        expect(assetSchema.parse(asset).pending_change?.mutation_kind).toBe('asset.link.asset.add');
        expect(assetSchema.safeParse({
            ...asset,
            pending_change: {
                ...pendingChange,
                relationship_change: {
                    ...pendingChange.relationship_change,
                    after: { dependency_type: 'Datová', supporting_asset_id: 991 },
                },
            },
        }).success).toBe(false);
        expect(assetSchema.safeParse({
            ...asset,
            pending_change: { ...pendingChange, mutation_kind: 'asset.link.future.add' },
        }).success).toBe(false);
    });

    it('parses governed Asset list, detail, and resolution response contracts', () => {
        const assetImpact = {
            before: { cif: 'no', resulting_criticality: 'medium' },
            after: { cif: 'yes', resulting_criticality: 'critical' },
        };
        const approval = {
            id: 186,
            resource_type: 'asset',
            resource_id: 91,
            resource_name: 'Claims platform',
            action_type: 'edit',
            pending_changes: { preliminary_criticality: { old: 'medium', new: 'critical' } },
            governed_mutation: {
                proposal_id: 'asset-proposal-186',
                proposal_version: 1,
                mutation_kind: 'asset.edit',
                before: { preliminary_criticality: 'medium' },
                after: { preliminary_criticality: 'critical' },
                derived_impact: assetImpact,
                impacted_resources: [{ resource_type: 'asset', resource_name: 'Claims platform' }],
                relationship_change: null,
            },
            status: 'pending',
            reason: 'Independent Asset review',
            requested_by_id: 7,
            requested_by_name: 'Alice',
            requested_by_email: 'alice@example.test',
            resolved_by_id: null,
            resolved_by_name: null,
            resolved_at: null,
            resolution_notes: null,
            created_at: '2026-07-19T00:00:00Z',
            can_approve: true,
            can_reject: true,
            capabilities: {
                can_read: true,
                can_approve: true,
                can_reject: true,
                can_cancel: false,
                can_cancel_as_requester: false,
                can_cancel_as_resolver: false,
                can_view_pending_changes: true,
                can_view_resolution_notes: false,
                can_inspect_side_effects: false,
                is_requester: false,
                is_primary_approver: true,
                is_privileged_resolver: false,
                is_pending: true,
                requires_privileged_resolution: false,
                would_apply_side_effects_on_approve: true,
            },
        };

        expect(approvalRequestSchema.parse(approval).resource_type).toBe('asset');
        expect(approvalListResponseSchema.parse({
            items: [approval], total: 1, skip: 0, limit: 50,
        }).items[0]?.governed_mutation?.mutation_kind).toBe('asset.edit');
        expect(approvalRequestSchema.parse({
            ...approval,
            status: 'approved',
            can_approve: false,
            can_reject: false,
            resolved_by_id: 8,
            resolved_by_name: 'Risk Manager',
            resolved_at: '2026-07-19T01:00:00Z',
            resolution_notes: 'Approved',
        }).status).toBe('approved');
    });

    it('accepts every exact Asset mutation kind and Composite Asset impacts', () => {
        const assetKinds = [
            'asset.create',
            'asset.edit',
            'asset.archive',
            'asset.link.asset.add',
            'asset.link.asset.remove',
            'asset.link.vendor.add',
            'asset.link.vendor.remove',
            'asset.link.risk.add',
            'asset.link.risk.remove',
        ] as const;
        for (const mutation_kind of assetKinds) {
            const creation = mutation_kind === 'asset.create';
            const relationship = mutation_kind.startsWith('asset.link.');
            const [, , relationshipType, action] = mutation_kind.split('.');
            expect(governedMutationReadSchema.safeParse({
                proposal_id: `proposal-${mutation_kind}`,
                proposal_version: 1,
                mutation_kind,
                before: creation ? {} : { name: 'Before' },
                after: { name: 'After' },
                derived_impact: creation
                    ? { before: null, after: { cif: 'yes', resulting_criticality: 'critical' } }
                    : relationship
                        ? { assets: [{
                            resource_name: 'Claims platform',
                            before: { cif: 'yes', resulting_criticality: 'critical' },
                            after: { cif: 'yes', resulting_criticality: 'critical' },
                        }] }
                        : {
                            before: { cif: 'yes', resulting_criticality: 'critical' },
                            after: { cif: 'yes', resulting_criticality: 'critical' },
                        },
                impacted_resources: creation
                    ? []
                    : [{ resource_type: 'asset', resource_name: 'Claims platform' }],
                relationship_change: relationship ? {
                    target_resource_type: relationshipType,
                    target_resource_name: `Related ${relationshipType}`,
                    action,
                    before: {},
                    after: {},
                } : null,
            }).success).toBe(true);
        }

        expect(governedMutationReadSchema.safeParse({
            proposal_id: 'composite-assets',
            proposal_version: 1,
            mutation_kind: 'process.archive',
            before: { is_archived: false },
            after: { is_archived: true },
            derived_impact: {
                processes: [{
                    resource_name: 'F7 — Payments',
                    before: { cif: 'yes', criticality_class: 'critical' },
                    after: { cif: 'no', criticality_class: 'medium' },
                }],
                assets: [{
                    resource_name: 'Claims platform',
                    before: { cif: 'yes', resulting_criticality: 'critical' },
                    after: { cif: 'no', resulting_criticality: 'medium' },
                }],
            },
            impacted_resources: [
                { resource_type: 'process', resource_name: 'F7 — Payments' },
                { resource_type: 'asset', resource_name: 'Claims platform' },
            ],
            relationship_change: null,
        }).success).toBe(true);
    });
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

        expect(approvalScenarioSchema.parse({
            id: 86,
            key: 'protected_asset_edit',
            display_name: 'Protected Asset mutations',
            description: 'Protected Asset workflow',
            requires_approval: true,
            approver_roles: ['risk_manager', 'cro'],
            fixed_policy: true,
            fixed_policy_definition: {
                threshold: 'current_or_proposed_cif_yes_or_resulting_criticality_critical',
                covered_actions: ['create', 'edit', 'link', 'archive'],
                allow_self_approval: false,
            },
            updated_at: '2026-07-19T00:00:00Z',
            updated_by_name: null,
        }).fixed_policy_definition?.covered_actions).toEqual(['create', 'edit', 'link', 'archive']);
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

    it('parses the exact safe Asset relationship detail returned by the backend', () => {
        const backendGovernedDetail = {
            proposal_id: 'proposal-asset-link-86',
            proposal_version: 1,
            mutation_kind: 'asset.link.asset.add',
            before: { relationship: null },
            after: { relationship: { dependency_type: 'Datová' } },
            derived_impact: {
                assets: [
                    {
                        resource_name: 'Payments platform',
                        before: { cif: 'yes', resulting_criticality: 'critical' },
                        after: { cif: 'yes', resulting_criticality: 'critical' },
                    },
                    {
                        resource_name: 'Restricted Asset',
                        before: { cif: 'no', resulting_criticality: 'low' },
                        after: { cif: 'no', resulting_criticality: 'medium' },
                    },
                ],
            },
            impacted_resources: [
                { resource_type: 'asset', resource_name: 'Payments platform' },
                { resource_type: 'asset', resource_name: 'Restricted Asset' },
            ],
            relationship_change: {
                target_resource_type: 'asset',
                target_resource_name: 'Restricted Asset',
                action: 'add',
                before: {},
                after: { dependency_type: 'Datová' },
            },
        };

        const parsed = governedMutationReadSchema.parse(backendGovernedDetail);
        expect(parsed.derived_impact).toEqual(backendGovernedDetail.derived_impact);
    });

    it('accepts the redacted pending Asset payload returned to an ordinary reader', () => {
        const redacted = {
            approval_id: null,
            proposal_id: null,
            proposal_version: null,
            status: 'pending',
            requested_at: '2026-07-29T08:00:00Z',
            requested_by_name: null,
            reason: '',
            generic_label: 'protected_asset_change',
            mutation_kind: null,
            before: {},
            after: {},
            derived_impact: {},
            impacted_resources: [],
            relationship_change: null,
            capabilities: { can_view_diff: false, can_cancel: false },
        };

        const parsed = assetSchema.parse({
            id: 75,
            name: 'Payments platform',
            business_owner_orphaned: false,
            ict_owner_orphaned: false,
            ownership_status: 'assigned',
            is_archived: false,
            pending_change: redacted,
            created_at: '2026-07-19T09:00:00Z',
            updated_at: '2026-07-19T09:00:00Z',
        });
        expect(parsed.pending_change).toEqual(redacted);
    });

    it('accepts a governed Asset impact whose resulting criticality is not classified', () => {
        expect(governedMutationReadSchema.safeParse({
            proposal_id: 'proposal-unclassified-asset',
            proposal_version: 1,
            mutation_kind: 'asset.edit',
            before: {},
            after: {},
            derived_impact: {
                before: { cif: 'no', resulting_criticality: null },
                after: { cif: 'no', resulting_criticality: null },
            },
            impacted_resources: [{ resource_type: 'asset', resource_name: 'Unclassified Asset' }],
            relationship_change: null,
        }).success).toBe(true);
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
            impacted_resources: [{ resource_type: 'vendor', resource_name: 'Vendor' }],
        }).success).toBe(true);
        expect(governedMutationReadSchema.safeParse({
            ...editMutation,
            impacted_resources: [{ resource_type: 'control', resource_name: 'Control' }],
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
