import { describe, expect, it } from 'vitest';

import { processEditNeedsRequestReason } from '@/pages/processes/processProtectedEdit';
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
