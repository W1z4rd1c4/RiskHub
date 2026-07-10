import { describe, expect, it } from 'vitest';

import {
    buildVendorPayload,
    validateVendorForm,
} from '@/components/vendor-form/vendorForm.mappers';

describe('VendorForm payload mapping', () => {
    it('trims string fields and normalizes empty optionals to null', () => {
        const payload = buildVendorPayload({
            name: '  Vendor Name  ',
            legal_name: '  Legal Name  ',
            registration_id: '   ',
            country: '  SK  ',
            website: '',
            description: '  Description  ',
            process: '  Claims  ',
            subprocess: '  Triage  ',
            department_id: 9,
            outsourcing_owner_user_id: 5,
            vendor_type: 'ict',
            risk_score_1_5: 4,
            supports_important_core_insurance_function: true,
            dora_relevant: false,
            is_significant_vendor: true,
            materiality_assessed_max_impact_pct_own_funds: 0.25,
            replaceability: 'Snadno nahraditelný',
            has_alternative_providers: true,
            // ICT Register extension fields normalize the same way.
            identifier_type: '  LEI  ',
            identifier_value: '  969500KN90DZLEVQ2X21  ',
            latin_name: '   ',
            last_audit_date: '2025-11-30',
            reference_occurrence_count: 12,
        });

        expect(payload).toEqual(
            expect.objectContaining({
                name: 'Vendor Name',
                legal_name: 'Legal Name',
                registration_id: null,
                country: 'SK',
                website: null,
                description: 'Description',
                process: 'Claims',
                subprocess: 'Triage',
                department_id: 9,
                outsourcing_owner_user_id: 5,
                vendor_type: 'ict',
                risk_score_1_5: 4,
                supports_important_core_insurance_function: true,
                dora_relevant: false,
                is_significant_vendor: true,
                materiality_assessed_max_impact_pct_own_funds: 0.25,
                replaceability: 'Snadno nahraditelný',
                has_alternative_providers: true,
                identifier_type: 'LEI',
                identifier_value: '969500KN90DZLEVQ2X21',
                latin_name: null,
                last_audit_date: '2025-11-30',
                exit_plan_state: null,
                reference_occurrence_count: 12,
                reference_process_count: null,
            }),
        );
    });

    it('leaves an unchanged legacy substitutability value unsent on edit', () => {
        const initialData = {
            id: 4,
            replaceability: 'easy',
        } as unknown as Parameters<typeof buildVendorPayload>[1];

        const unchanged = buildVendorPayload({ name: 'Vendor', replaceability: 'easy' }, initialData);
        expect('replaceability' in unchanged).toBe(false);

        const changed = buildVendorPayload(
            { name: 'Vendor', replaceability: 'Nenahraditelný' },
            initialData,
        );
        expect(changed.replaceability).toBe('Nenahraditelný');
    });

    it('returns the translated validation key for missing required fields', () => {
        const t = (key: string) => key;
        expect(validateVendorForm({}, t)).toBe('errors.name_required');
        expect(validateVendorForm({ name: 'Vendor' }, t)).toBe('errors.process_required');
        expect(validateVendorForm({ name: 'Vendor', process: 'Claims' }, t)).toBe('errors.department_required');
        expect(
            validateVendorForm({ name: 'Vendor', process: 'Claims', department_id: 3 }, t),
        ).toBe('errors.owner_required');
    });
});
