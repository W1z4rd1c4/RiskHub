import { describe, expect, it } from 'vitest';

import {
    buildVendorDetailPath,
    canEditVendorByOwnership,
    coerceVendorContext,
    getVendorDetailScrollTargetId,
    shouldNormalizeVendorDetailSearch,
} from '@/pages/vendors/vendorDetailPresentation';

describe('Vendor detail presentation helpers', () => {
    it('builds the vendor detail path and preserves optional tab parameters', () => {
        expect(buildVendorDetailPath(42)).toBe('/vendors/42');
        expect(buildVendorDetailPath(42, 'operations', 'sla')).toBe('/vendors/42?tab=operations&section=sla');
    });

    it('grants ownership edit access only to the outsourcing owner', () => {
        const vendor = {
            outsourcing_owner_user_id: 7,
        } as const;

        expect(canEditVendorByOwnership(vendor, 7)).toBe(true);
        expect(canEditVendorByOwnership(vendor, 3)).toBe(false);
        expect(canEditVendorByOwnership(null, 7)).toBe(false);
    });

    it('sanitizes vendor-context query params for routed create flows', () => {
        expect(coerceVendorContext('42', '/vendors/42')).toEqual({
            vendorId: 42,
            returnTo: '/vendors/42',
        });
        expect(coerceVendorContext('42', '/risks/99')).toEqual({
            vendorId: 42,
            returnTo: '/vendors/42',
        });
        expect(coerceVendorContext('oops', '/vendors/42')).toEqual({
            vendorId: null,
            returnTo: null,
        });
    });

    it('maps supported vendor detail query sections to scroll targets', () => {
        expect(getVendorDetailScrollTargetId('assessments', 'schedule')).toBe('vendor-linked-kris');
        expect(getVendorDetailScrollTargetId('connections', 'risks')).toBe('vendor-linked-risks');
        expect(getVendorDetailScrollTargetId('connections', 'controls')).toBe('vendor-linked-controls');
        expect(getVendorDetailScrollTargetId('connections', 'unknown')).toBeNull();
    });

    it('normalizes legacy vendor detail tab searches while preserving supported deep links', () => {
        expect(shouldNormalizeVendorDetailSearch('?tab=sla')).toBe(true);
        expect(shouldNormalizeVendorDetailSearch('?tab=operations&section=sla')).toBe(true);
        expect(shouldNormalizeVendorDetailSearch('?tab=assessments&section=schedule')).toBe(false);
        expect(shouldNormalizeVendorDetailSearch('?filter=active')).toBe(false);
        expect(shouldNormalizeVendorDetailSearch('')).toBe(false);
    });
});
