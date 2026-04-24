import { describe, expect, it } from 'vitest';

import {
    buildRiskListParams,
    formatRiskGroupLabel,
    getRiskGroupBy,
    normalizeRiskSummary,
    parseRisksPageQueryParams,
} from '@/pages/risks/risksPagePresentation';

describe('Risks page presentation helpers', () => {
    it('parses one-time inbound breached and critical query params', () => {
        const parsed = parseRisksPageQueryParams(
            new URLSearchParams('breached=true&critical=true')
        );

        expect(parsed).toEqual({
            hasBreachFilter: true,
            criticalFilter: true,
        });
    });

    it('builds archived risk list params and normalizes missing counts', () => {
        expect(
            buildRiskListParams({
                currentPage: 1,
                criticalFilter: true,
                hasBreachFilter: true,
                limit: 20,
                priorityFilter: true,
                search: '  priority  ',
                sortDirection: 'desc',
                sortField: 'net_score',
                statusFilter: 'archived',
                typeFilter: 'operational',
            })
        ).toEqual({
            offset: 0,
            limit: 20,
            search: 'priority',
            status: 'archived',
            risk_type: 'operational',
            is_priority: true,
            has_breach: true,
            min_net_score: 15,
            sort_by: 'net_score',
            sort_order: 'desc',
            include_archived: true,
            group_by: undefined,
            group_value: undefined,
        });

        expect(
            normalizeRiskSummary({
                id: 1,
                risk_id_code: 'R-001',
                name: 'Priority risk',
                process: 'Operations',
                risk_type: 'operational',
                category: 'Process',
                description: 'Desc',
                gross_score: 9,
                gross_probability: 3,
                gross_impact: 3,
                net_score: 4,
                status: 'active',
                is_priority: false,
            })
        ).toMatchObject({
            kri_count: 0,
            has_breach: false,
            control_count: 0,
            linked_vendors: [],
        });
    });

    it('maps server grouped views and fallback labels', () => {
        expect(getRiskGroupBy('vendor')).toBe('vendor');
        expect(getRiskGroupBy('risk_type')).toBe('risk_type');
        expect(getRiskGroupBy('all')).toBeNull();
        expect(
            formatRiskGroupLabel(
                { value: '__unlinked_vendor__', label: '__unlinked_vendor__', count: 1 },
                {
                    unlinkedVendor: 'Unlinked Vendor',
                    uncategorized: 'Uncategorized',
                    unknownDepartment: 'Unknown Department',
                    noProcess: 'No Process',
                    unknownRiskType: 'Unknown type',
                },
            )
        ).toBe('Unlinked Vendor');
    });
});
