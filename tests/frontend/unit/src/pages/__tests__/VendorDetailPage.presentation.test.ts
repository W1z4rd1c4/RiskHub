import { describe, expect, it } from 'vitest';

import {
    canEditVendorByOwnership,
    parseVendorTab,
} from '@/pages/vendors/vendorDetailPresentation';

describe('Vendor detail presentation helpers', () => {
    it('accepts only supported vendor detail tabs', () => {
        expect(parseVendorTab('sla')).toBe('sla');
        expect(parseVendorTab('linked_controls')).toBe('linked_controls');
        expect(parseVendorTab('not-a-real-tab')).toBeNull();
        expect(parseVendorTab(null)).toBeNull();
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
