import type {
    Vendor,
    VendorType,
} from '@/types/vendor';

export interface DepartmentLookup {
    id: number;
    name: string;
    code?: string;
}

export interface VendorFormProps {
    initialData?: Vendor;
    isEdit?: boolean;
    onSaved: (vendor: Vendor) => void;
    onCancel?: () => void;
}

export type VendorFlagKey =
    | 'supports_important_core_insurance_function'
    | 'dora_relevant'
    | 'is_significant_vendor'
    | 'has_alternative_providers';

export type VendorOption = {
    value: string;
    label: string;
};

export type VendorFormData = Partial<Vendor>;
export type VendorFormField = keyof VendorFormData;

export const vendorTypeOptions: { value: VendorType; labelKey: string }[] = [
    { value: 'ict', labelKey: 'form.vendor_type.ict' },
    { value: 'outsourcing', labelKey: 'form.vendor_type.outsourcing' },
    { value: 'professional_services', labelKey: 'form.vendor_type.professional_services' },
    { value: 'partner', labelKey: 'form.vendor_type.partner' },
    { value: 'other', labelKey: 'form.vendor_type.other' },
];

/** ICT Register extension: entered text/coded columns handled uniformly (trim or null). */
export const VENDOR_REGISTER_TEXT_FIELDS = [
    'latin_name',
    'person_type',
    'identifier_type',
    'identifier_value',
    'address',
    'contact_person',
    'contact',
    'ultimate_parent_name',
    'ultimate_parent_lei',
    'data_storage',
    'service_country',
    'data_location',
    'processing_location',
    'data_sensitivity',
    'substitutability_reason',
    'exit_plan_state',
    'reintegration',
    'service_disruption_impact',
    'alternative_providers',
    'alternative_providers_names',
    'ctpp_designation',
    'ex_ante_operational',
    'ex_ante_legal',
    'ex_ante_ict',
    'ex_ante_reputational',
    'ex_ante_data_confidentiality',
    'ex_ante_data_availability',
    'ex_ante_data_location',
    'ex_ante_provider_location',
    'ex_ante_ict_concentration',
    'assessment_phase',
    'due_diligence_state',
    'significance_authorization_conditions',
    'significance_regulatory_requirements',
    'significance_service_quality',
    'significance_financial_impact',
    'significance_reputation_continuity',
    'significance_cumulative_impact',
    'significance_justification',
    'note',
] as const;

/** ICT Register extension: entered date columns (ISO strings from date inputs). */
export const VENDOR_REGISTER_DATE_FIELDS = [
    'last_audit_date',
    'ex_ante_assessment_date',
    'last_monitoring_date',
] as const;

export function createInitialVendorFormData(initialData?: Vendor): VendorFormData {
    return {
        name: '',
        legal_name: '',
        registration_id: '',
        country: '',
        website: '',
        description: '',
        process: '',
        subprocess: '',
        department_id: null,
        outsourcing_owner_user_id: 0,
        vendor_type: 'other',
        risk_score_1_5: 3,
        supports_important_core_insurance_function: false,
        dora_relevant: false,
        is_significant_vendor: false,
        materiality_assessed_max_impact_pct_own_funds: null,
        replaceability: null,
        has_alternative_providers: false,
        ...initialData,
    };
}
