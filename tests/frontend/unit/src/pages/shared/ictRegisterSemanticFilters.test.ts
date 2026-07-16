import { describe, expect, it } from 'vitest';

import {
    parseAssetSemanticFilters,
    parseProcessSemanticFilters,
    parseRiskSemanticFilters,
    parseVendorSemanticFilters,
    presentSemanticFilters,
} from '@/pages/shared/ictRegisterSemanticFilters';

describe('ICT register semantic query filters', () => {
    it('parses every public committee drill-down parameter', () => {
        expect(parseProcessSemanticFilters(new URLSearchParams('cif=true'))).toEqual({ cif: true });
        expect(
            parseAssetSemanticFilters(new URLSearchParams('has_process_link=true&criticality=Kritick%C3%A1')),
        ).toEqual({
            has_process_link: true,
            criticality: 'critical',
        });
        expect(
            parseVendorSemanticFilters(
                new URLSearchParams(
                    'has_direct_process_link=true&has_roi_contract=true&has_sub_outsourcing=true&tier=Kritick%C3%BD+dodavatel',
                ),
            ),
        ).toEqual({
            has_direct_process_link: true,
            has_roi_contract: true,
            has_sub_outsourcing: true,
            tier: 'Kritický dodavatel',
        });
        expect(
            parseRiskSemanticFilters(
                new URLSearchParams(
                    'ict_linked=true&above_tolerance=true&response=acceptance&gross_probability=5&gross_impact=4&gross_band=Kritick%C3%A9&net_band=Vysok%C3%A9',
                ),
            ),
        ).toEqual({
            ict_linked: true,
            above_tolerance: true,
            response: 'acceptance',
            gross_probability: 5,
            gross_impact: 4,
            gross_band: 'Kritické',
            net_band: 'Vysoké',
        });
    });

    it('normalizes legacy localized Asset criticality links to canonical request codes', () => {
        const cases = [
            ['Nízká', 'low'],
            ['Střední', 'medium'],
            ['Vysoká', 'high'],
            ['Kritická', 'critical'],
            ['critical', 'critical'],
        ];

        for (const [queryValue, expected] of cases) {
            const params = new URLSearchParams({ criticality: queryValue });
            expect(parseAssetSemanticFilters(params).criticality).toBe(expected);
        }
    });

    it('ignores invalid booleans, coordinates, and response values in API and summary state', () => {
        const parsed = parseRiskSemanticFilters(
            new URLSearchParams('ict_linked=false&response=mitigation&gross_probability=0&gross_impact=6'),
        );
        expect(presentSemanticFilters(parsed)).toEqual({});
    });
});
