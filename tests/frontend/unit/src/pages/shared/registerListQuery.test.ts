import { describe, expect, it } from 'vitest';

import {
    buildRegisterUrlParams,
    parseRegisterUrlState,
    type RegisterUrlState,
} from '@/pages/shared/registerListQuery';

const state: RegisterUrlState = {
    filters: {
        bcm_link: ['yes', 'not_assessed'],
        cif: true,
        department_ids: [7, 9],
        mtpd: { min: 4, max: 48 },
    },
    search: 'claims',
    selectedGroupValue: 'department:7',
    sort: { field: 'f_code', direction: 'desc' },
    view: 'department',
};

describe('shared register URL state', () => {
    it('round-trips search, view, sort, filters, and opaque group without persisting page', () => {
        const params = buildRegisterUrlParams(state, new URLSearchParams('committee_scope=true&page=5'));

        expect(params.get('q')).toBe('claims');
        expect(params.get('view')).toBe('department');
        expect(params.get('sort')).toBe('f_code:desc');
        expect(params.get('group')).toBe('department:7');
        expect(params.get('page')).toBeNull();
        expect(params.get('committee_scope')).toBe('true');
        expect(parseRegisterUrlState(params, { defaultView: 'all' })).toEqual(state);
    });

    it('drops malformed values and returns the active/all unsorted default', () => {
        expect(parseRegisterUrlState(
            new URLSearchParams('sort=oops&filters=%7Bbad&group=&page=4'),
            { defaultView: 'all' },
        )).toEqual({
            filters: {},
            search: '',
            selectedGroupValue: null,
            sort: null,
            view: 'all',
        });
    });
});
