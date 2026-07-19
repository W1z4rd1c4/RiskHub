import { describe, expect, it } from 'vitest';

import {
    processEditNeedsRequestReason,
    processMutationRequiresApprovalReason,
} from '@/pages/processes/processProtectedEdit';
import type { Process } from '@/types/process';

const baseCandidate = {
    cif_override: '',
    preliminary_criticality: 'low',
    mtpd_hours: '72',
    impact_client: '1',
    impact_market_operations: '1',
    impact_regulatory: '1',
    impact_financial: '1',
};

function processWithCif(cif: 'yes' | 'no'): Process {
    return {
        id: 7,
        f_code: 'F-0007',
        l0_area: 'Operations',
        l1_process: 'Payments',
        owner_orphaned: false,
        ownership_status: 'assigned',
        is_archived: false,
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
        derived: {
            cif,
            bcm_check: 'ok',
            linked_asset_count: 0,
            linked_vendor_count: 0,
            is_complete: true,
            is_duplicate: false,
            transitive_vendor_links: [],
            inputs: {
                threshold_critical_score: 16,
                threshold_high_score: 12,
                threshold_medium_score: 8,
                mtpd_critical_hours: 24,
                mtpd_medium_hours: 72,
                criticality_class_source: 'score',
                cif_class_critical: false,
                cif_mtpd_within_critical: false,
                cif_any_impact_maximal: false,
                missing_for_completeness: [],
                manual_vendor_link_count: 0,
                transitive_vendor_pair_count: 0,
            },
        },
    };
}

describe('processEditNeedsRequestReason', () => {
    it('keeps a downgrade protected when the current Process CIF is Yes', () => {
        expect(processEditNeedsRequestReason(processWithCif('yes'), {
            ...baseCandidate,
            cif_override: 'no',
        })).toBe(true);
    });

    it('recognizes proposed CIF override, MTPD, and impact protection triggers', () => {
        const process = processWithCif('no');
        expect(processEditNeedsRequestReason(process, { ...baseCandidate, cif_override: 'yes' })).toBe(true);
        expect(processEditNeedsRequestReason(process, { ...baseCandidate, mtpd_hours: '24' })).toBe(true);
        expect(processEditNeedsRequestReason(process, { ...baseCandidate, impact_regulatory: '5' })).toBe(true);
    });

    it('does not require a reason for a provably unprotected candidate', () => {
        expect(processEditNeedsRequestReason(processWithCif('no'), baseCandidate)).toBe(false);
    });
});

describe('processMutationRequiresApprovalReason', () => {
    it('uses live scenario metadata and derived CIF for existing-row actions', () => {
        const protectedProcess = processWithCif('yes');
        protectedProcess.capabilities = {
            can_read: true,
            can_update: true,
            can_archive: true,
            can_restore: false,
            protected_change_requires_approval: true,
            can_request_change: true,
            can_cancel_pending_change: false,
            has_pending_change: false,
            business_edit_blocked: false,
        };
        expect(processMutationRequiresApprovalReason(protectedProcess)).toBe(true);

        const directProcess = processWithCif('no');
        directProcess.capabilities = protectedProcess.capabilities;
        expect(processMutationRequiresApprovalReason(directProcess)).toBe(false);

        protectedProcess.capabilities = {
            ...protectedProcess.capabilities,
            protected_change_requires_approval: false,
        };
        expect(processMutationRequiresApprovalReason(protectedProcess)).toBe(false);
    });

    it('fails closed when the selected Process projection is unavailable', () => {
        expect(processMutationRequiresApprovalReason(undefined)).toBe(true);
    });
});
