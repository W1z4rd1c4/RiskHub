import { describe, expect, it } from 'vitest';

import { buildAssetCollectionQuery } from '@/services/assetApi';

describe('Asset collection API query', () => {
    it('encodes repeated OR values, Boolean false, grouping, and shared JSON once', () => {
        const query = buildAssetCollectionQuery({
            offset: 20,
            limit: 20,
            search: 'claims',
            include_archived: false,
            lifecycle: ['active'],
            sort: { field: 'name', direction: 'asc' },
            view: 'department',
            group_by: 'department',
            group_value: 'department:7',
            department_ids: [7, 9],
            asset_types: ['application', 'database'],
            cif: false,
            internet_exposed: false,
            linked_vendor_ids: [41, 42],
        });

        expect(query.getAll('department_ids')).toEqual(['7', '9']);
        expect(query.getAll('asset_types')).toEqual(['application', 'database']);
        expect(query.getAll('linked_vendor_ids')).toEqual(['41', '42']);
        expect(query.get('cif')).toBe('false');
        expect(query.get('internet_exposed')).toBe('false');
        expect(query.get('group_value')).toBe('department:7');
        expect(JSON.parse(query.get('filters') ?? '{}')).toEqual(expect.objectContaining({
            search: 'claims',
            include_archived: false,
            lifecycle: ['active'],
            department_ids: [7, 9],
            asset_types: ['application', 'database'],
            cif: false,
            internet_exposed: false,
            linked_vendor_ids: [41, 42],
        }));
        expect(query.has('committee_scope')).toBe(false);
    });
});
