import { describe, expect, it } from 'vitest';

import { buildProcessCollectionQuery } from '@/services/processApi';

describe('Process collection API query', () => {
    it('encodes repeated OR values, Boolean false, inclusive ranges, grouping, and shared JSON once', () => {
        const query = buildProcessCollectionQuery({
            offset: 20,
            limit: 20,
            search: 'claims',
            include_archived: false,
            lifecycle: ['active'],
            sort: { field: 'f_code', direction: 'asc' },
            view: 'department',
            group_by: 'department',
            group_value: 'department:7',
            department_ids: [7, 9],
            l0_areas: ['Claims', 'Operations'],
            cif: false,
            mtpd_min: 4,
            mtpd_max: 48,
        });

        expect(query.getAll('department_ids')).toEqual(['7', '9']);
        expect(query.getAll('l0_areas')).toEqual(['Claims', 'Operations']);
        expect(query.get('cif')).toBe('false');
        expect(query.get('mtpd_min')).toBe('4');
        expect(query.get('mtpd_max')).toBe('48');
        expect(query.get('group_value')).toBe('department:7');
        expect(JSON.parse(query.get('filters') ?? '{}')).toEqual(expect.objectContaining({
            search: 'claims',
            include_archived: false,
            lifecycle: ['active'],
            department_ids: [7, 9],
            l0_areas: ['Claims', 'Operations'],
            cif: false,
            mtpd_min: 4,
            mtpd_max: 48,
        }));
        expect(query.has('committee_scope')).toBe(false);
    });
});
