import { describe, expect, it } from 'vitest';

import { getVendorDisplayStatus } from '@/pages/vendors/vendorsPagePresentation';

describe('Vendors page presentation helpers', () => {
    it('derives inactive display status from the archive flag', () => {
        expect(getVendorDisplayStatus({ is_archived: true })).toBe('inactive');
        expect(getVendorDisplayStatus({ is_archived: false })).toBe('active');
    });
});
