import { describe, expect, it } from 'vitest';

import {
    buildVendorDetailPath,
    canEditVendorByOwnership,
    coerceVendorContext,
} from '@/pages/vendors/vendorDetailPresentation';

describe('Vendor detail presentation helpers', () => {
    it('builds the canonical vendor detail path without tab parameters', () => {
        expect(buildVendorDetailPath(42)).toBe('/vendors/42');
        expect(buildVendorDetailPath(42, 'operations', 'sla')).toBe('/vendors/42');
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
});
