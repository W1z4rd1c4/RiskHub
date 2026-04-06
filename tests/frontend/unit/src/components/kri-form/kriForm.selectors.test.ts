import { describe, expect, it } from 'vitest';

import { filterRisksForSelection, getEffectiveVendorIds, isRiskLinkedToVendor } from '@/components/kri-form/kriForm.selectors';
import type { RiskSummary } from '@/types/risk';

const risks: RiskSummary[] = [
    {
        id: 101,
        risk_id_code: 'RISK-101',
        name: 'Vendor-linked risk',
        process: 'Claims',
        risk_type: 'operational',
        category: 'Operational',
        description: 'Linked risk',
        gross_score: 4,
        gross_probability: 2,
        gross_impact: 2,
        net_score: 3,
        status: 'active',
        is_priority: false,
        department_id: 7,
        department_name: 'Operations',
    },
    {
        id: 202,
        risk_id_code: 'RISK-202',
        name: 'Standalone risk',
        process: 'Finance',
        risk_type: 'financial',
        category: 'Financial',
        description: 'Standalone risk',
        gross_score: 5,
        gross_probability: 3,
        gross_impact: 2,
        net_score: 4,
        status: 'active',
        is_priority: false,
        department_id: 9,
        department_name: 'Finance',
    },
];

describe('kriForm.selectors', () => {
    it('keeps vendor-context IDs unique in the effective assignment set', () => {
        expect(getEffectiveVendorIds([12, 21, 12], { vendorId: 12, returnTo: '/vendors/12' })).toEqual([12, 21]);
    });

    it('filters risks by search, business filters, and vendor-link scope', () => {
        const filtered = filterRisksForSelection({
            displayedRisks: risks,
            riskSearch: 'linked',
            selectedDeptId: '7',
            selectedProcess: 'Claims',
            selectedCategory: 'Operational',
            showOnlyVendorLinkedRisks: true,
            vendorContext: { vendorId: 12, returnTo: '/vendors/12' },
            vendorLinkedRiskIds: [101],
        });

        expect(filtered).toEqual([risks[0]]);
        expect(isRiskLinkedToVendor(101, { vendorId: 12, returnTo: '/vendors/12' }, [101])).toBe(true);
        expect(isRiskLinkedToVendor(202, { vendorId: 12, returnTo: '/vendors/12' }, [101])).toBe(false);
    });
});
