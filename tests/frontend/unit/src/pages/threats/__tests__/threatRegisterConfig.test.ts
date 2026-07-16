import { describe, expect, it } from 'vitest';

import {
    THREAT_REGISTER_CONFIG,
    buildThreatRegisterListParams,
} from '@/pages/threats/threatRegisterConfig';

describe('Threat register configuration', () => {
    it('declares every confirmed global view and addable filter once', () => {
        expect(THREAT_REGISTER_CONFIG.views.map(({ value }) => value)).toEqual([
            'all',
            'category',
            'threat_steward',
            'relevant_subject',
            'linked_risk',
        ]);
        expect(THREAT_REGISTER_CONFIG.filters.map(({ key }) => key)).toEqual([
            'categories',
            'steward_ids',
            'relevant_subjects',
            'has_linked_risk',
            'linked_risk_ids',
            'linked_risk_types',
            'linked_risk_department_ids',
        ]);
    });

    it('maps URL-backed UI state to the backend AND/OR/group vocabulary', () => {
        expect(buildThreatRegisterListParams({
            currentPage: 3,
            filters: {
                lifecycle: 'active',
                categories: ['availability', 'integrity'],
                steward_ids: [7],
                relevant_subjects: ['ICT service'],
                has_linked_risk: false,
                linked_risk_ids: [11, 12],
                linked_risk_types: ['operational'],
                linked_risk_department_ids: [4],
            },
            groupValue: 'risk:11',
            limit: 25,
            search: 'ransomware',
            sort: { field: 'linked_risk_count', direction: 'desc' },
            view: 'linked_risk',
        })).toEqual(expect.objectContaining({
            offset: 50,
            limit: 25,
            search: 'ransomware',
            include_archived: false,
            lifecycle: ['active'],
            view: 'linked_risk',
            group_by: 'linked_risk',
            group_value: 'risk:11',
            categories: ['availability', 'integrity'],
            steward_ids: [7],
            relevant_subjects: ['ICT service'],
            has_linked_risk: false,
            linked_risk_ids: [11, 12],
            linked_risk_types: ['operational'],
            linked_risk_department_ids: [4],
        }));
    });
});
