import { describe, expect, it } from 'vitest';

import {
    buildVendorSearchParams,
    canEditVendorByOwnership,
    normalizeVendorLocation,
    parseVendorTab,
} from '@/pages/vendors/vendorDetailPresentation';

describe('Vendor detail presentation helpers', () => {
    it('accepts only supported canonical vendor detail tabs', () => {
        expect(parseVendorTab('overview')).toBe('overview');
        expect(parseVendorTab('operations')).toBe('operations');
        expect(parseVendorTab('not-a-real-tab')).toBeNull();
        expect(parseVendorTab(null)).toBeNull();
    });

    it('normalizes legacy vendor tabs into canonical tab and section pairs', () => {
        expect(normalizeVendorLocation('sla', null)).toEqual({
            tab: 'operations',
            section: 'sla',
            shouldCanonicalize: true,
        });
        expect(normalizeVendorLocation('assessments', 'schedule')).toEqual({
            tab: 'assessments',
            section: 'schedule',
            shouldCanonicalize: false,
        });
        expect(normalizeVendorLocation('overview', 'schedule')).toEqual({
            tab: 'overview',
            section: 'risk_factors',
            shouldCanonicalize: true,
        });
    });

    it('builds canonical vendor query params', () => {
        expect(buildVendorSearchParams('operations', 'sla').toString()).toBe('tab=operations&section=sla');
        expect(buildVendorSearchParams('overview', null).toString()).toBe('tab=overview');
    });

    it('grants ownership edit access only to the outsourcing owner', () => {
        const vendor = {
            outsourcing_owner_user_id: 7,
        } as const;

        expect(canEditVendorByOwnership(vendor, 7)).toBe(true);
        expect(canEditVendorByOwnership(vendor, 3)).toBe(false);
        expect(canEditVendorByOwnership(null, 7)).toBe(false);
    });
});
