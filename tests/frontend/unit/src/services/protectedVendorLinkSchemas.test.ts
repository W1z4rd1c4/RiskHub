import { describe, expect, it } from 'vitest';

import {
    approvalListResponseSchema,
    approvalRequestSchema,
    governedMutationReadSchema,
} from '@/services/api/schemas';

import controlAdd from './fixtures/vendorLinkApprovals/vendor-link-control-add.json';
import controlRemove from './fixtures/vendorLinkApprovals/vendor-link-control-remove.json';
import kriAdd from './fixtures/vendorLinkApprovals/vendor-link-kri-add.json';
import kriRemove from './fixtures/vendorLinkApprovals/vendor-link-kri-remove.json';
import riskAdd from './fixtures/vendorLinkApprovals/vendor-link-risk-add.json';
import riskRemove from './fixtures/vendorLinkApprovals/vendor-link-risk-remove.json';

const vendorLinkFixtures = [
    ['vendor.link.risk.add', riskAdd],
    ['vendor.link.risk.remove', riskRemove],
    ['vendor.link.control.add', controlAdd],
    ['vendor.link.control.remove', controlRemove],
    ['vendor.link.kri.add', kriAdd],
    ['vendor.link.kri.remove', kriRemove],
] as const;

describe('protected Vendor relationship API schemas (#99)', () => {
    it.each(vendorLinkFixtures)(
        'parses the backend-proven %s list and detail payloads',
        (kind, fixture) => {
            const list = approvalListResponseSchema.parse(fixture.list);
            expect(list.items).toHaveLength(1);
            expect(list.items[0]?.governed_mutation?.mutation_kind).toBe(kind);

            const detail = approvalRequestSchema.parse(fixture.detail);
            const governed = detail.governed_mutation;
            expect(governed?.mutation_kind).toBe(kind);
            expect(governed?.derived_impact).toEqual({
                before: { tier: 'significant' },
                after: { tier: 'significant' },
            });
            expect(governed?.relationship_change?.target_resource_type)
                .toBe(kind.split('.')[2]);
            expect(governed?.relationship_change?.action)
                .toBe(kind.endsWith('.add') ? 'add' : 'remove');
        },
    );

    it('rejects a Vendor relationship proposal whose tier block is not identical', () => {
        expect(() => governedMutationReadSchema.parse({
            ...riskAdd.detail.governed_mutation,
            derived_impact: {
                before: { tier: 'standard' },
                after: { tier: 'significant' },
            },
        })).toThrow('Governed relationship projection does not match its mutation kind');
    });

    it('rejects a Vendor relationship proposal carrying a composite impact', () => {
        expect(() => governedMutationReadSchema.parse({
            ...riskAdd.detail.governed_mutation,
            derived_impact: {
                vendors: [{
                    resource_name: 'Seam Vendor vendor.link.risk.add',
                    before: { tier: 'significant' },
                    after: { tier: 'significant' },
                }],
            },
        })).toThrow('Governed relationship projection does not match its mutation kind');
    });
});

const processRelationshipMutation = {
    proposal_id: 'proposal-99-process',
    proposal_version: 1,
    mutation_kind: 'process.link.risk.add',
    before: { linked: false },
    after: { linked: true },
    derived_impact: {
        processes: [{
            resource_name: 'Payments',
            before: { cif: 'no', criticality_class: 'medium' },
            after: { cif: 'yes', criticality_class: 'critical' },
        }],
    },
    impacted_resources: [{ resource_type: 'process', resource_name: 'Payments' }],
    relationship_change: {
        target_resource_type: 'risk',
        target_resource_name: 'Fraud',
        action: 'add',
        before: { linked: false },
        after: { linked: true },
    },
};

const assetRelationshipMutation = {
    proposal_id: 'proposal-99-asset',
    proposal_version: 1,
    mutation_kind: 'asset.link.risk.add',
    before: { linked: false },
    after: { linked: true },
    derived_impact: {
        assets: [{
            resource_name: 'Payment platform',
            before: { cif: 'no', resulting_criticality: 'medium' },
            after: { cif: 'yes', resulting_criticality: 'critical' },
        }],
    },
    impacted_resources: [{ resource_type: 'asset', resource_name: 'Payment platform' }],
    relationship_change: {
        target_resource_type: 'risk',
        target_resource_name: 'Fraud',
        action: 'add',
        before: { linked: false },
        after: { linked: true },
    },
};

describe('Process and Asset relationship proposals keep the composite requirement', () => {
    it('parses Process and Asset relationship proposals with a composite impact', () => {
        expect(governedMutationReadSchema.parse(processRelationshipMutation).mutation_kind)
            .toBe('process.link.risk.add');
        expect(governedMutationReadSchema.parse(assetRelationshipMutation).mutation_kind)
            .toBe('asset.link.risk.add');
    });

    it('rejects a Process relationship proposal without a composite impact', () => {
        expect(() => governedMutationReadSchema.parse({
            ...processRelationshipMutation,
            derived_impact: {
                before: { cif: 'no', criticality_class: 'medium' },
                after: { cif: 'no', criticality_class: 'medium' },
            },
        })).toThrow('Governed relationship projection does not match its mutation kind');
    });

    it('rejects an Asset relationship proposal without a composite impact', () => {
        expect(() => governedMutationReadSchema.parse({
            ...assetRelationshipMutation,
            derived_impact: {
                before: { cif: 'no', resulting_criticality: 'medium' },
                after: { cif: 'no', resulting_criticality: 'medium' },
            },
        })).toThrow('Governed relationship projection does not match its mutation kind');
    });
});
