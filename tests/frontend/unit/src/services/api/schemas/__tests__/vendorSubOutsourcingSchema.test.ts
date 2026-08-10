import { describe, expect, it } from 'vitest';

import { vendorSubOutsourcingSchema } from '@/services/api/schemas/entities/vendors';

const baseResponse = {
    id: 1,
    vendor_id: 2,
    contract_id: 3,
    is_archived: false,
    created_at: '2026-07-14T20:00:00Z',
    updated_at: '2026-07-14T20:00:00Z',
};

describe('vendorSubOutsourcingSchema', () => {
    it('validates and preserves the sub-provider person type', () => {
        const parsed = vendorSubOutsourcingSchema.parse({
            ...baseResponse,
            person_type: 'Fyzická osoba podnikající',
        });

        expect(parsed.person_type).toBe('Fyzická osoba podnikající');
    });

    it('rejects a malformed sub-provider person type', () => {
        expect(() =>
            vendorSubOutsourcingSchema.parse({ ...baseResponse, person_type: 42 }),
        ).toThrow();
    });
});
