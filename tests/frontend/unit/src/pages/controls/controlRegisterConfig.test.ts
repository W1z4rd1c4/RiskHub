import { describe, expect, it } from 'vitest';

import { buildControlRegisterListParams, parseControlRegisterFilters, serializeControlRegisterFilters } from '@/pages/controls/controlRegisterConfig';
import { buildControlCollectionQuery } from '@/services/controlApi';

describe('Control shared register contract', () => {
    it('round-trips lifecycle, monitoring, and addable scalar filters', () => {
        const filters = parseControlRegisterFilters({ lifecycle: 'all', monitoring_status: 'failed', status: 'active', process: 'Payments', category: 'manual' });
        expect(serializeControlRegisterFilters(filters)).toEqual({ lifecycle: 'all', monitoring_status: 'failed', status: 'active', process: 'Payments', category: 'manual' });
    });

    it('translates browser view into group_by without leaking view to the API', () => {
        const params = buildControlRegisterListParams({
            currentPage: 1, filters: { lifecycle: 'active', monitoring_status: 'passed', status: '', process: '', category: '' },
            groupValue: 'risk:7', limit: 50, search: ' evidence ', sort: { field: 'name', direction: 'asc' }, view: 'risk',
        });
        const query = buildControlCollectionQuery(params);
        expect(query.get('view')).toBeNull();
        expect(query.get('group_by')).toBe('risk');
        expect(query.get('group_value')).toBe('risk:7');
        expect(JSON.parse(query.get('sort') ?? '{}')).toEqual({ field: 'name', direction: 'asc' });
        expect(JSON.parse(query.get('filters') ?? '{}')).toMatchObject({ search: 'evidence', monitoring_status: 'passed' });
    });

    it.each(['all', 'archived'] as const)(
        'AND-composes lifecycle=%s with Control domain and monitoring status',
        (lifecycle) => {
            const params = buildControlRegisterListParams({
                currentPage: 1,
                filters: {
                    lifecycle,
                    monitoring_status: 'failed',
                    status: 'inactive',
                    process: '',
                    category: '',
                },
                groupValue: null,
                limit: 50,
                search: '',
                sort: null,
                view: 'all',
            });
            const criteria = JSON.parse(buildControlCollectionQuery(params).get('filters') ?? '{}');

            expect(criteria).toMatchObject({ lifecycle, status: 'inactive', monitoring_status: 'failed' });
            expect(criteria).not.toHaveProperty('include_archived');
        },
    );
});
