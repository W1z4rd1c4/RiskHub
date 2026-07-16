import { describe, expect, it } from 'vitest';

import {
    ASSET_REGISTER_CONFIG,
    buildAssetRegisterListParams,
} from '@/pages/assets/assetRegisterConfig';

describe('Asset register configuration', () => {
    it('declares every confirmed view and addable filter once', () => {
        expect(ASSET_REGISTER_CONFIG.views.map(({ value }) => value)).toEqual([
            'all',
            'department',
            'business_owner',
            'type',
            'criticality',
            'process',
            'vendor',
        ]);
        expect(ASSET_REGISTER_CONFIG.filters.map(({ key }) => key)).toEqual([
            'department_ids',
            'business_owner_ids',
            'ict_owner_ids',
            'asset_types',
            'asset_levels',
            'deployment_models',
            'criticality',
            'cif',
            'legacy',
            'spof',
            'external_dependency',
            'gdpr_relevance',
            'ai_relevance',
            'internet_exposed',
            'data_classification',
            'is_complete',
            'lifecycle_states',
            'linked_process_ids',
            'linked_asset_ids',
            'linked_vendor_ids',
            'linked_risk_ids',
        ]);
    });

    it('maps normalized URL state to the backend grouping and AND/OR vocabulary', () => {
        expect(buildAssetRegisterListParams({
            currentPage: 2,
            filters: {
                lifecycle: 'all',
                department_ids: [2, 4],
                business_owner_ids: [7],
                ict_owner_ids: [],
                asset_types: ['application', 'database'],
                asset_levels: [],
                deployment_models: ['cloud'],
                criticality: ['critical'],
                cif: false,
                legacy: true,
                spof: null,
                external_dependency: null,
                gdpr_relevance: ['yes'],
                ai_relevance: [],
                internet_exposed: false,
                data_classification: [],
                is_complete: true,
                lifecycle_states: ['operational'],
                linked_process_ids: [10],
                linked_asset_ids: [11],
                linked_vendor_ids: [12],
                linked_risk_ids: [13],
            },
            groupValue: 'process:10',
            limit: 25,
            search: 'claims',
            sort: { field: 'name', direction: 'asc' },
            view: 'process',
        })).toEqual(expect.objectContaining({
            offset: 25,
            limit: 25,
            search: 'claims',
            include_archived: true,
            lifecycle: ['active', 'archived'],
            view: 'process',
            group_by: 'process',
            group_value: 'process:10',
            department_ids: [2, 4],
            business_owner_ids: [7],
            asset_types: ['application', 'database'],
            criticality: ['critical'],
            cif: false,
            legacy: true,
            is_complete: true,
            linked_process_ids: [10],
            linked_asset_ids: [11],
            linked_vendor_ids: [12],
            linked_risk_ids: [13],
        }));
    });
});
