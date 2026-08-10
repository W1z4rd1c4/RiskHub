import { describe, expect, it } from 'vitest';

import {
    buildVendorRegisterListParams,
    VENDOR_REGISTER_CONFIG,
} from '@/pages/vendors/vendorRegisterConfig';

describe('Vendor register configuration', () => {
    it('retains every mature view and declares the confirmed filter surface once', () => {
        expect(VENDOR_REGISTER_CONFIG.views.map(({ value }) => value)).toEqual([
            'all',
            'department',
            'process',
            'type',
            'risk',
            'flag',
        ]);
        expect(VENDOR_REGISTER_CONFIG.filters.map(({ key }) => key)).toEqual([
            'department_ids',
            'outsourcing_owner_ids',
            'vendor_types',
            'risk_scores',
            'tiers',
            'dora_relevant',
            'cif',
            'is_significant_vendor',
            'substitutability',
            'countries',
            'country_categories',
            'has_roi_contract',
            'has_sub_outsourcing',
            'has_direct_process_link',
            'linked_process_ids',
            'linked_asset_ids',
            'linked_risk_ids',
            'linked_control_ids',
            'linked_kri_ids',
        ]);
    });

    it('maps normalized URL state to server grouping and AND/OR filters', () => {
        expect(buildVendorRegisterListParams({
            currentPage: 2,
            filters: {
                lifecycle: 'all',
                department_ids: [2, 4],
                outsourcing_owner_ids: [7],
                vendor_types: ['ict', 'outsourcing'],
                risk_scores: [4, 5],
                tiers: ['critical'],
                dora_relevant: true,
                cif: false,
                is_significant_vendor: null,
                substitutability: ['not_substitutable'],
                countries: ['CZ', 'DE'],
                country_categories: ['domestic'],
                has_roi_contract: true,
                has_sub_outsourcing: false,
                has_direct_process_link: true,
                linked_process_ids: [10],
                linked_asset_ids: [11],
                linked_risk_ids: [12],
                linked_control_ids: [13],
                linked_kri_ids: [14],
            },
            groupValue: 'risk:12',
            limit: 25,
            search: 'claims',
            sort: { field: 'name', direction: 'asc' },
            view: 'risk',
        })).toEqual(expect.objectContaining({
            offset: 25,
            limit: 25,
            search: 'claims',
            include_archived: true,
            lifecycle: ['active', 'archived'],
            view: 'risk',
            group_by: 'risk',
            group_value: 'risk:12',
            department_ids: [2, 4],
            outsourcing_owner_ids: [7],
            vendor_types: ['ict', 'outsourcing'],
            risk_scores: [4, 5],
            tiers: ['critical'],
            dora_relevant: true,
            cif: false,
            substitutability: ['not_substitutable'],
            countries: ['CZ', 'DE'],
            country_categories: ['domestic'],
            has_roi_contract: true,
            has_sub_outsourcing: false,
            has_direct_process_link: true,
            linked_process_ids: [10],
            linked_asset_ids: [11],
            linked_risk_ids: [12],
            linked_control_ids: [13],
            linked_kri_ids: [14],
        }));
    });
});
