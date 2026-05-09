import type {
    Vendor,
    VendorReplaceability,
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

export const replaceabilityOptions: { value: VendorReplaceability; labelKey: string }[] = [
    { value: 'easy', labelKey: 'form.replaceability.easy' },
    { value: 'medium', labelKey: 'form.replaceability.medium' },
    { value: 'hard', labelKey: 'form.replaceability.hard' },
];

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
