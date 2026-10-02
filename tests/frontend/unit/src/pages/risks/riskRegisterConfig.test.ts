import { describe, expect, it } from 'vitest';

import {
    buildRiskRegisterListParams,
    parseRiskRegisterFilters,
    resolveRiskTypeDisplayName,
    serializeRiskRegisterFilters,
    toBackendRiskNetBand,
} from '@/pages/risks/riskRegisterConfig';
import { buildRiskCollectionQuery } from '@/services/riskApi';

describe('Risk shared register contract', () => {
    it('round-trips compact URL filters and preserves the mature quick filters', () => {
        const filters = parseRiskRegisterFilters({
            lifecycle: 'archived', status: 'emerging', risk_type: 'operational',
            is_priority: true, has_breach: false, critical: true, net_band: 'high',
        });
        expect(serializeRiskRegisterFilters(filters)).toEqual({
            lifecycle: 'archived', status: 'emerging', risk_type: 'operational',
            is_priority: true, has_breach: false, critical: true, net_band: 'high',
        });
    });

    it('PG-40: keeps language-neutral band codes in the URL and maps them to the backend band only in API params', () => {
        // Older links carry the backend value; they parse to the code.
        expect(parseRiskRegisterFilters({ net_band: 'Vysoké' }).net_band).toBe('high');
        expect(parseRiskRegisterFilters({ net_band: 'Kritické' }).net_band).toBe('critical');
        expect(parseRiskRegisterFilters({ net_band: 'low' }).net_band).toBe('low');
        expect(parseRiskRegisterFilters({ net_band: 'bogus' }).net_band).toBe('');
        expect(serializeRiskRegisterFilters(parseRiskRegisterFilters({ net_band: 'Nízké' })).net_band).toBe('low');
        expect(toBackendRiskNetBand('medium')).toBe('Střední');
        expect(toBackendRiskNetBand('')).toBeUndefined();
    });

    it('maps browser view to grouping and keeps view out of API/export queries', () => {
        const params = buildRiskRegisterListParams({
            criticalMinNetScore: 15, currentPage: 2,
            filters: { lifecycle: 'active', status: 'active', risk_type: '', is_priority: true, has_breach: null, critical: true, net_band: 'critical' },
            groupValue: 'Operations', limit: 50, search: ' resilience ', sort: { field: 'net_score', direction: 'desc' }, view: 'department',
        });
        const query = buildRiskCollectionQuery(params);
        expect(query.get('view')).toBeNull();
        expect(query.get('group_by')).toBe('department');
        expect(query.get('group_value')).toBe('Operations');
        expect(JSON.parse(query.get('sort') ?? '{}')).toEqual({ field: 'net_score', direction: 'desc' });
        expect(JSON.parse(query.get('filters') ?? '{}')).toMatchObject({
            search: 'resilience',
            is_priority: true,
            min_net_score: 15,
            net_band: 'Kritické',
        });
    });

    it.each(['all', 'archived'] as const)(
        'keeps lifecycle=%s independent from the selected Risk domain status',
        (lifecycle) => {
            const params = buildRiskRegisterListParams({
                criticalMinNetScore: 15,
                currentPage: 1,
                filters: {
                    lifecycle,
                    status: 'emerging',
                    risk_type: '',
                    is_priority: null,
                    has_breach: null,
                    critical: false,
                    net_band: '',
                },
                groupValue: null,
                limit: 50,
                search: '',
                sort: null,
                view: 'all',
            });
            const criteria = JSON.parse(buildRiskCollectionQuery(params).get('filters') ?? '{}');

            expect(criteria).toMatchObject({ lifecycle, status: 'emerging' });
            expect(criteria).not.toHaveProperty('include_archived');
        },
    );

    it('localizes built-in Risk types and preserves configured custom display names', () => {
        const translate = (key: string, fallback: string) => ({
            'categories.operational': 'Operační',
        }[key] ?? fallback);

        expect(resolveRiskTypeDisplayName('operational', 'Operational', translate)).toBe('Operační');
        expect(resolveRiskTypeDisplayName('cyber_resilience', 'Cyber Resilience', translate))
            .toBe('Cyber Resilience');
        expect(resolveRiskTypeDisplayName('unconfigured_custom', undefined, translate))
            .toBe('unconfigured_custom');
    });
});
