import { describe, expect, it } from 'vitest';

import { vendorSchema } from '@/services/api/schemas/entities/vendors';

const baseVendor = {
    id: 1,
    name: 'Acme',
    process: 'P1',
    outsourcing_owner_user_id: 1,
    linked_risks: [],
    vendor_type: 'ict' as const,
    risk_score_1_5: 3,
    supports_important_core_insurance_function: false,
    dora_relevant: false,
    is_significant_vendor: false,
    has_alternative_providers: true,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

describe('vendorSchema soft-tolerates missing status (pre-migration #69+#70)', () => {
    it('accepts payload WITH status: active (literal)', () => {
        const result = vendorSchema.safeParse({ ...baseVendor, status: 'active' });
        expect(result.success).toBe(true);
    });

    it('accepts payload WITHOUT status field', () => {
        const result = vendorSchema.safeParse(baseVendor);
        expect(result.success).toBe(true);
    });
});
