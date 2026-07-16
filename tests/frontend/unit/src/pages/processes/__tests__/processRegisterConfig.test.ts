import { describe, expect, it } from 'vitest';

import {
    PROCESS_REGISTER_CONFIG,
    buildProcessRegisterListParams,
} from '@/pages/processes/processRegisterConfig';

describe('Process register configuration', () => {
    it('declares every confirmed view and addable filter once', () => {
        expect(PROCESS_REGISTER_CONFIG.views.map(({ value }) => value)).toEqual([
            'all',
            'department',
            'owner',
            'l0',
            'criticality',
            'vendor',
        ]);
        expect(PROCESS_REGISTER_CONFIG.filters.map(({ key }) => key)).toEqual([
            'department_ids',
            'owner_ids',
            'l0_areas',
            'criticality',
            'cif',
            'is_complete',
            'licensed_activity',
            'bcm_link',
            'dr_test_result',
            'mtpd',
            'linked_asset_ids',
            'linked_vendor_ids',
            'linked_risk_ids',
        ]);
    });

    it('maps the normalized UI query to backend AND/OR/range vocabulary', () => {
        expect(buildProcessRegisterListParams({
            currentPage: 3,
            filters: {
                lifecycle: 'active',
                department_ids: [2, 4],
                owner_ids: [],
                l0_areas: ['Operations', 'Claims'],
                criticality: ['high'],
                cif: false,
                is_complete: true,
                licensed_activity: [],
                bcm_link: ['yes'],
                dr_test_result: [],
                mtpd: { min: 8, max: 72 },
                linked_asset_ids: [10],
                linked_vendor_ids: [11, 12],
                linked_risk_ids: [],
            },
            groupValue: 'department:2',
            limit: 25,
            search: 'claims',
            sort: { field: 'f_code', direction: 'asc' },
            view: 'department',
        })).toEqual(expect.objectContaining({
            offset: 50,
            limit: 25,
            search: 'claims',
            include_archived: false,
            view: 'department',
            group_by: 'department',
            group_value: 'department:2',
            department_ids: [2, 4],
            l0_areas: ['Operations', 'Claims'],
            criticality: ['high'],
            cif: false,
            is_complete: true,
            bcm_link: ['yes'],
            mtpd_min: 8,
            mtpd_max: 72,
            linked_asset_ids: [10],
            linked_vendor_ids: [11, 12],
        }));
    });
});
