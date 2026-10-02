import { describe, expect, it } from 'vitest';

import {
    getApprovalActionTone,
    getApprovalStatusTone,
    getGovernedActionLabel,
} from '@/pages/approvals/approvalsPresentation';

describe('Approvals page presentation helpers', () => {
    it('presents expired approvals as a neutral terminal state', () => {
        expect(getApprovalStatusTone('expired')).toBe('neutral');
        expect(getApprovalStatusTone('cancelled')).toBe('neutral');
    });

    it('maps every approval status and request type to a semantic tone', () => {
        expect(getApprovalStatusTone('pending')).toBe('warning');
        expect(getApprovalStatusTone('pending_privileged')).toBe('accent');
        expect(getApprovalStatusTone('approved')).toBe('success');
        expect(getApprovalStatusTone('rejected')).toBe('danger');
        expect(getApprovalActionTone('archive')).toBe('danger');
        expect(getApprovalActionTone('delete')).toBe('danger');
        expect(getApprovalActionTone('create')).toBe('success');
        expect(getApprovalActionTone('edit')).toBe('info');
    });

    it('never classifies unknown mutation suffixes as legitimate relationship actions', () => {
        expect(getGovernedActionLabel('edit', 'future.resource.add')).toBe('update');
        expect(getGovernedActionLabel('edit', 'process.link.vendor.update')).toBe('update');
        expect(getGovernedActionLabel('edit', 'unknown_link_remove')).toBe('update');
    });

    // #102: governed Asset link/unlink approvals read as explicit link
    // additions/removals, never as a generic "update".
    it('labels every governed asset.link.* kind as an explicit link add/remove', () => {
        expect(getGovernedActionLabel('edit', 'asset.link.asset.add')).toBe('link_add');
        expect(getGovernedActionLabel('edit', 'asset.link.vendor.add')).toBe('link_add');
        expect(getGovernedActionLabel('edit', 'asset.link.risk.add')).toBe('link_add');
        expect(getGovernedActionLabel('edit', 'asset.link.asset.remove')).toBe('link_remove');
        expect(getGovernedActionLabel('edit', 'asset.link.vendor.remove')).toBe('link_remove');
        expect(getGovernedActionLabel('edit', 'asset.link.risk.remove')).toBe('link_remove');
        // Unknown asset.link suffixes still fall back to the generic label.
        expect(getGovernedActionLabel('edit', 'asset.link.asset.update')).toBe('update');
    });
});
