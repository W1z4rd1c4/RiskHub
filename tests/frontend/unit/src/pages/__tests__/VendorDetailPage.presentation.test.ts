import { describe, expect, it } from 'vitest';

import {
    buildVendorDetailPath,
    canEditVendorByOwnership,
    coerceVendorContext,
    getVendorDetailScrollTargetId,
    normalizeVendorDetailSearch,
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
        expect(coerceVendorContext(
            '42',
            '/vendors/42?tab=contracts&source=linked-create#vendor-contracts',
        )).toEqual({
            vendorId: 42,
            returnTo: '/vendors/42?tab=contracts&source=linked-create#vendor-contracts',
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

    it.each([
        '12junk',
        '12.5',
        '0',
        '-12',
        '01',
        ' 12 ',
        '9007199254740992',
    ])('rejects non-exact positive Vendor ID %s', (vendorIdRaw) => {
        expect(coerceVendorContext(vendorIdRaw, '/vendors/12')).toEqual({
            vendorId: null,
            returnTo: null,
        });
    });

    it.each([
        '/vendors/13',
        '/vendors/12/edit',
        '/vendors/12/contracts',
        '//vendors/12',
        'https://outside.example/vendors/12',
        '/vendors/12/../13',
        '/vendors/12/%2e%2e/13',
        '/vendors/%31%32',
        '/vendors/12%2Fedit',
    ])('rejects unsafe or mismatched Vendor return destination %s', (returnToRaw) => {
        expect(coerceVendorContext('12', returnToRaw)).toEqual({
            vendorId: 12,
            returnTo: '/vendors/12',
        });
    });

    it('maps supported vendor detail query sections to scroll targets', () => {
        expect(getVendorDetailScrollTargetId('assessments', 'schedule')).toBe('vendor-linked-kris');
        expect(getVendorDetailScrollTargetId('connections', 'risks')).toBe('vendor-linked-risks');
        expect(getVendorDetailScrollTargetId('connections', 'controls')).toBe('vendor-linked-controls');
        expect(getVendorDetailScrollTargetId('connections', 'unknown')).toBeNull();
    });

    it('normalizes legacy vendor detail tab searches while preserving supported deep links', () => {
        expect(normalizeVendorDetailSearch('?tab=sla')).toBe('');
        expect(normalizeVendorDetailSearch('?source=review&tab=operations&section=sla')).toBe('?source=review');
        expect(normalizeVendorDetailSearch('?tab=assessments&section=schedule')).toBeNull();
        expect(normalizeVendorDetailSearch('?filter=active')).toBeNull();
        expect(normalizeVendorDetailSearch('')).toBeNull();
    });
});
