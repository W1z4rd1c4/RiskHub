import { describe, expect, it } from 'vitest';

import { buildThreatCollectionQuery } from '@/services/threatApi';

describe('Threat collection API query', () => {
    it('encodes OR values, Boolean false, grouping, and the shared filter object', () => {
        const query = buildThreatCollectionQuery({
            offset: 20,
            limit: 20,
            search: 'weakness',
            lifecycle: ['active'],
            sort: { field: 'threat_steward', direction: 'asc' },
            view: 'linked_risk',
            group_by: 'linked_risk',
            group_value: 'risk:9',
            categories: ['availability', 'integrity'],
            has_linked_risk: false,
            linked_risk_department_ids: [3, 4],
        });

        expect(query.getAll('categories')).toEqual(['availability', 'integrity']);
        expect(query.get('has_linked_risk')).toBe('false');
        expect(query.getAll('linked_risk_department_ids')).toEqual(['3', '4']);
        expect(query.get('group_value')).toBe('risk:9');
        expect(JSON.parse(query.get('filters') ?? '{}')).toEqual(expect.objectContaining({
            search: 'weakness',
            lifecycle: ['active'],
            categories: ['availability', 'integrity'],
            has_linked_risk: false,
            linked_risk_department_ids: [3, 4],
        }));
    });
});
