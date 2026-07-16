import type { SafeTFunction } from '@/i18n/hooks';

/** Locale-independent Vendor codes accepted by the API. */
export const VENDOR_CONTROLLED_CODES = {
    country: ['CZ', 'SK', 'DE', 'AT', 'NL', 'PL', 'GB', 'US', 'IE', 'FR', 'LU'],
    person_type: ['legal_person', 'individual_acting_in_business_capacity'],
    identifier_type: ['LEI', 'EUID', 'CRN', 'VAT', 'PNR', 'NIN'],
    data_sensitivity: ['low', 'medium', 'high'],
    replaceability: ['not_substitutable', 'highly_complex', 'medium_complexity', 'easily_substitutable'],
    substitutability_reason: ['limited_market_alternatives', 'migration_difficulties', 'both'],
    exit_plan_state: ['not_required', 'required_missing', 'draft', 'approved', 'tested', 'review_required', 'not_assessed'],
    reintegration: ['easy', 'difficult', 'highly_complex'],
    service_disruption_impact: ['low', 'medium', 'high', 'not_assessed'],
    alternative_providers: ['yes', 'no', 'not_assessed'],
    ctpp_designation: ['yes', 'no', 'undetermined'],
    ex_ante_operational: ['ok', 'risk', 'not_applicable'],
    ex_ante_legal: ['ok', 'risk', 'not_applicable'],
    ex_ante_ict: ['ok', 'risk', 'not_applicable'],
    ex_ante_reputational: ['ok', 'risk', 'not_applicable'],
    ex_ante_data_confidentiality: ['ok', 'risk', 'not_applicable'],
    ex_ante_data_availability: ['ok', 'risk', 'not_applicable'],
    ex_ante_data_location: ['ok', 'risk', 'not_applicable'],
    ex_ante_provider_location: ['ok', 'risk', 'not_applicable'],
    ex_ante_ict_concentration: ['ok', 'risk', 'not_applicable'],
    assessment_phase: ['ex_ante', 'ongoing', 'not_applicable'],
    due_diligence_state: ['not_applicable', 'not_started', 'in_progress', 'completed_without_reservations', 'completed_with_reservations', 'review_required', 'not_assessed'],
    significance_authorization_conditions: ['yes', 'no', 'not_applicable'],
    significance_regulatory_requirements: ['yes', 'no', 'not_applicable'],
    significance_service_quality: ['yes', 'no', 'not_applicable'],
    significance_financial_impact: ['yes', 'no', 'not_applicable'],
    significance_reputation_continuity: ['yes', 'no', 'not_applicable'],
    significance_cumulative_impact: ['yes', 'no', 'not_applicable'],
} as const;

export type VendorControlledField = keyof typeof VENDOR_CONTROLLED_CODES;
export type VendorControlledCode<Field extends VendorControlledField> =
    (typeof VENDOR_CONTROLLED_CODES)[Field][number];

export function vendorValueLabel(t: SafeTFunction, field: string, value: string | null | undefined): string {
    if (!value) return '—';
    const missing = '__vendor_value_missing__';
    const fieldKey = `vendors:values.${field}.${value}`;
    const fieldLabel = t(fieldKey, { defaultValue: missing });
    if (fieldLabel !== missing) return fieldLabel;
    return t('vendors:values.unknown');
}

export function vendorValueOptions(t: SafeTFunction, field: VendorControlledField) {
    return VENDOR_CONTROLLED_CODES[field].map((value) => ({
        value,
        label: vendorValueLabel(t, field, value),
    }));
}
