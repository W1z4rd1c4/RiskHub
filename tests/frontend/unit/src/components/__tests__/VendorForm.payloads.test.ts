import { describe, expect, it } from 'vitest';

import {
    buildVendorPayload,
    buildVendorUpdatePayload,
    validateVendorForm,
} from '@/components/vendor-form/vendorForm.mappers';
import type { Vendor } from '@/types/vendor';

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
            replaceability: 'easily_substitutable',
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
                replaceability: 'easily_substitutable',
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

    it('keeps canonical substitutability codes in edit payloads', () => {
        const initialData = {
            id: 4,
            replaceability: 'easily_substitutable',
        } as unknown as Parameters<typeof buildVendorPayload>[1];

        const payload = buildVendorPayload(
            { name: 'Vendor', replaceability: 'easily_substitutable' },
            initialData,
        );
        expect(payload.replaceability).toBe('easily_substitutable');
    });

    it('builds an edit diff without unchanged accountability or create fields', () => {
        const initial = {
            id: 4,
            name: 'Vendor',
            process: 'Claims',
            department_id: 9,
            outsourcing_owner_user_id: 5,
            vendor_type: 'ict',
            risk_score_1_5: 3,
            supports_important_core_insurance_function: false,
            dora_relevant: false,
            is_significant_vendor: false,
            has_alternative_providers: false,
        } as Vendor;

        expect(buildVendorUpdatePayload({ ...initial, name: 'Renamed Vendor' }, initial)).toEqual({
            name: 'Renamed Vendor',
        });
    });

    it('includes accountability keys only when an authorized editor changes them', () => {
        const initial = {
            id: 4,
            name: 'Vendor',
            process: 'Claims',
            department_id: 9,
            outsourcing_owner_user_id: 5,
            vendor_type: 'ict',
            risk_score_1_5: 3,
            supports_important_core_insurance_function: false,
            dora_relevant: false,
            is_significant_vendor: false,
            has_alternative_providers: false,
        } as Vendor;

        expect(buildVendorUpdatePayload({ ...initial, department_id: 10, outsourcing_owner_user_id: 6 }, initial))
            .toEqual({ department_id: 10, outsourcing_owner_user_id: 6 });
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
