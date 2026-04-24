import { describe, expect, it } from 'vitest';

import { riskLookupsTestExports } from '@/components/risk-form/useRiskLookups';

const { collectRiskLookupOptions } = riskLookupsTestExports;

describe('risk form lookup helpers', () => {
    it('deduplicates process, category, and subprocess suggestions', () => {
        const options = collectRiskLookupOptions([
            { process: 'Claims', subprocess: 'FNOL', category: 'Operational' },
            { process: 'Claims', subprocess: 'FNOL', category: 'Operational' },
            { process: 'Claims', subprocess: 'Settlement', category: 'Financial' },
            { process: 'Underwriting', subprocess: null, category: null },
        ]);

        expect(options.existingProcesses).toEqual(['Claims', 'Underwriting']);
        expect(options.existingCategories).toEqual(['Operational', 'Financial']);
        expect(options.subprocessesByProcess).toEqual({
            Claims: ['FNOL', 'Settlement'],
        });
    });
});
