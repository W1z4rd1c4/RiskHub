import { describe, expect, it } from 'vitest';

import {
    approvalRequestSchema,
    governedMutationReadSchema,
    vendorPendingChangeSchema,
} from '@/services/api/schemas';
import { GOVERNED_MUTATION_KINDS } from '@/types/approval';

const vendorImpact = {
    before: { tier: 'standard' },
    after: { tier: 'significant' },
};

describe('protected Vendor API schemas', () => {
    it('keeps Asset and Process Vendor links on their governed composite identities', () => {
        expect(GOVERNED_MUTATION_KINDS).not.toContain('vendor.link.asset.add');
        expect(GOVERNED_MUTATION_KINDS).not.toContain('vendor.link.asset.remove');
        expect(GOVERNED_MUTATION_KINDS).not.toContain('vendor.link.process.add');
        expect(GOVERNED_MUTATION_KINDS).not.toContain('vendor.link.process.remove');
    });

    it('parses the safe Vendor pending-change projection', () => {
        expect(vendorPendingChangeSchema.parse({
            approval_id: 87,
            proposal_id: 'proposal-87',
            proposal_version: 1,
            status: 'pending',
            requested_at: '2026-07-30T05:00:00Z',
            requested_by_name: 'Outsourcing Owner',
            reason: 'Material Vendor change',
            generic_label: 'protected_vendor_change',
            mutation_kind: 'vendor.edit',
            before: { name: 'Hosting partner' },
            after: { name: 'Critical hosting partner' },
            derived_impact: vendorImpact,
            impacted_resources: [{ resource_type: 'vendor', resource_name: 'Hosting partner' }],
            relationship_change: null,
            capabilities: { can_view_diff: true, can_cancel: true },
        })).toMatchObject({
            mutation_kind: 'vendor.edit',
            derived_impact: vendorImpact,
        });
    });

    it('parses Vendor approvals and full-cascade Vendor consequences', () => {
        const mutation = {
            proposal_id: 'proposal-composite-87',
            proposal_version: 1,
            mutation_kind: 'process.edit',
            before: { name: 'Payments' },
            after: { name: 'Critical payments' },
            derived_impact: {
                processes: [{
                    resource_name: 'Payments',
                    before: { cif: 'no', criticality_class: 'medium' },
                    after: { cif: 'yes', criticality_class: 'critical' },
                }],
                assets: [{
                    resource_name: 'Payment platform',
                    before: { cif: 'no', resulting_criticality: 'medium' },
                    after: { cif: 'yes', resulting_criticality: 'critical' },
                }],
                vendors: [{
                    resource_name: 'Hosting partner',
                    before: { tier: 'standard' },
                    after: { tier: 'critical' },
                }],
            },
            impacted_resources: [
                { resource_type: 'process', resource_name: 'Payments' },
                { resource_type: 'asset', resource_name: 'Payment platform' },
                { resource_type: 'vendor', resource_name: 'Hosting partner' },
            ],
            relationship_change: null,
        };

        expect(governedMutationReadSchema.parse(mutation).derived_impact).toMatchObject({
            vendors: [{ resource_name: 'Hosting partner' }],
        });
        expect(approvalRequestSchema.parse({
            id: 87,
            resource_type: 'vendor',
            resource_id: 7,
            resource_name: 'Hosting partner',
            action_type: 'edit',
            pending_changes: null,
            governed_mutation: {
                ...mutation,
                mutation_kind: 'vendor.edit',
                derived_impact: vendorImpact,
                impacted_resources: [{ resource_type: 'vendor', resource_name: 'Hosting partner' }],
            },
            status: 'pending',
            reason: 'Material Vendor change',
            requested_by_id: 17,
            requested_by_name: 'Outsourcing Owner',
            requested_by_email: 'owner@example.test',
            resolved_by_id: null,
            resolved_by_name: null,
            resolved_at: null,
            resolution_notes: null,
            created_at: '2026-07-30T05:00:00Z',
            can_approve: true,
            can_reject: true,
        }).resource_type).toBe('vendor');
    });
});
