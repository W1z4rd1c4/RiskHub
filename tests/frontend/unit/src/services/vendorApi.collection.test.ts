import { describe, expect, it } from 'vitest';

import { buildVendorCollectionQuery } from '@/services/vendorApi';

describe('Vendor collection API query', () => {
    it('encodes repeated OR values, Boolean false, grouping, and shared JSON once', () => {
        const query = buildVendorCollectionQuery({
            offset: 20,
            limit: 20,
            search: 'claims',
            include_archived: false,
            lifecycle: ['active'],
            sort: { field: 'name', direction: 'asc' },
            view: 'risk',
            group_by: 'risk',
            group_value: 'risk:7',
            department_ids: [7, 9],
            vendor_types: ['ict', 'outsourcing'],
            risk_scores: [4, 5],
            cif: false,
            has_sub_outsourcing: false,
            linked_process_ids: [41, 42],
        });

        expect(query.getAll('department_ids')).toEqual(['7', '9']);
        expect(query.getAll('vendor_types')).toEqual(['ict', 'outsourcing']);
        expect(query.getAll('risk_scores')).toEqual(['4', '5']);
        expect(query.getAll('linked_process_ids')).toEqual(['41', '42']);
        expect(query.get('cif')).toBe('false');
        expect(query.get('has_sub_outsourcing')).toBe('false');
        expect(query.get('group_value')).toBe('risk:7');
        expect(JSON.parse(query.get('filters') ?? '{}')).toEqual(expect.objectContaining({
            search: 'claims',
            include_archived: false,
            lifecycle: ['active'],
            department_ids: [7, 9],
            vendor_types: ['ict', 'outsourcing'],
            risk_scores: [4, 5],
            cif: false,
            has_sub_outsourcing: false,
            linked_process_ids: [41, 42],
        }));
    });
});
