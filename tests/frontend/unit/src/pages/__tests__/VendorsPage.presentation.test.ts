import { describe, expect, it } from 'vitest';

import { buildVendorListParams, getVendorDisplayStatus } from '@/pages/vendors/vendorsPagePresentation';

describe('Vendors page presentation helpers', () => {
    it('builds archived vendor params with the inactive query alias', () => {
        expect(
            buildVendorListParams({
                currentPage: 1,
                debouncedSearch: '',
                includeArchived: true,
                limit: 20,
                sortDirection: null,
                sortField: null,
                statusFilter: 'inactive',
                typeFilter: '',
            })
        ).toEqual({
            offset: 0,
            limit: 20,
            include_archived: true,
            status: 'inactive',
        });
    });

    it('builds active vendor params without archived rows', () => {
        expect(
            buildVendorListParams({
                currentPage: 2,
                debouncedSearch: '  claims  ',
                includeArchived: false,
                limit: 10,
                sortDirection: null,
                sortField: null,
                statusFilter: 'active',
                typeFilter: '',
            })
        ).toEqual({
            offset: 10,
            limit: 10,
            include_archived: false,
            search: 'claims',
            status: 'active',
        });
    });

    it('derives inactive display status from the archive flag', () => {
        expect(getVendorDisplayStatus({ status: 'active', is_archived: true })).toBe('inactive');
        expect(getVendorDisplayStatus({ status: 'active', is_archived: false })).toBe('active');
    });
});
