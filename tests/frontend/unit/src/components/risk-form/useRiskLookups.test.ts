import { describe, expect, it } from 'vitest';

import { riskLookupsTestExports } from '@/components/risk-form/useRiskLookups';
import type { RiskSummary } from '@/types/risk';

const { collectRiskLookupOptions } = riskLookupsTestExports;

describe('risk form lookup helpers', () => {
    it('deduplicates process, category, and subprocess suggestions', () => {
        const risks: RiskSummary[] = [
            buildRiskSummary({ process: 'Claims', subprocess: 'FNOL', category: 'Operational' }),
            buildRiskSummary({ id: 2, process: 'Claims', subprocess: 'FNOL', category: 'Operational' }),
            buildRiskSummary({ id: 3, process: 'Claims', subprocess: 'Settlement', category: 'Financial' }),
            buildRiskSummary({ id: 4, process: 'Underwriting', subprocess: null, category: null }),
        ];
        const options = collectRiskLookupOptions(risks);

        expect(options.existingProcesses).toEqual(['Claims', 'Underwriting']);
        expect(options.existingCategories).toEqual(['Operational', 'Financial']);
        expect(options.subprocessesByProcess).toEqual({
            Claims: ['FNOL', 'Settlement'],
        });
    });
});

function buildRiskSummary(overrides: Partial<RiskSummary> = {}): RiskSummary {
    return {
        id: 1,
        risk_id_code: 'R-001',
        name: 'Operational risk',
        process: 'Claims',
        risk_type: 'operational',
        category: 'Operational',
        description: 'Risk summary used for lookup suggestions.',
        gross_score: 9,
        gross_probability: 3,
        gross_impact: 3,
        net_score: 6,
        status: 'active',
        is_priority: false,
        ...overrides,
    };
}
