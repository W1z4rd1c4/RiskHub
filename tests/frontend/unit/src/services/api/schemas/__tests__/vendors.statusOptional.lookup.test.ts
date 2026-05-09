import { describe, expect, it } from 'vitest';

import { linkedVendorSummarySchema } from '@/services/api/schemas/entities/vendors';

describe('linkedVendorSummarySchema already soft-tolerates status', () => {
    it('accepts linked vendor summaries without status', () => {
        const result = linkedVendorSummarySchema.safeParse({ id: 1, name: 'Acme' });
        expect(result.success).toBe(true);
    });
});
