import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import type { Vendor, VendorListParams } from '@/types/vendor';

const vendorTypesSource = () => readFileSync('src/types/vendor.ts', 'utf8');
const vendorSchemaSource = () =>
    readFileSync('src/services/api/schemas/entities/vendors.ts', 'utf8');

describe('Vendor type post-status-drop', () => {
    it('source no longer declares VendorStatus or schema status', () => {
        expect(vendorTypesSource()).not.toContain('VendorStatus');
        expect(vendorTypesSource()).not.toContain('status?:');
        expect(vendorSchemaSource()).not.toContain("status: z.enum(['active']).optional()");
    });

    it('Vendor type has no status field', () => {
        const v: Vendor = {
            id: 1,
            name: 'X',
            outsourcing_owner_user_id: 1,
            linked_risks: [],
            vendor_type: 'ict',
            risk_score_1_5: 1,
            supports_important_core_insurance_function: false,
            dora_relevant: false,
            is_significant_vendor: false,
            has_alternative_providers: false,
            process: 'p',
            is_archived: false,
            created_at: 'now',
            updated_at: 'now',
        };
        // @ts-expect-error status field must not exist on Vendor
        const s = v.status;
        expect(s).toBeUndefined();
    });

    it('VendorListParams has no status query field', () => {
        const p: VendorListParams = {};
        // @ts-expect-error status query removed
        const s = p.status;
        expect(s).toBeUndefined();
    });
});
