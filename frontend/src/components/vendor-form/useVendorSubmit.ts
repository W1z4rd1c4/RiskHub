import type { SafeTFunction } from '@/i18n/hooks';
import { vendorApi } from '@/services/vendorApi';
import type { Vendor } from '@/types/vendor';
import type { VendorCreate } from '@/types/vendor';

import {
    buildVendorPayload,
    buildVendorUpdatePayload,
    validateVendorFormFields,
} from './vendorForm.mappers';
import type { VendorFormData, VendorFormField } from './vendorForm.types';

interface UseVendorSubmitOptions {
    formData: VendorFormData;
    initialData?: Vendor;
    isEdit: boolean;
    onSaved: (vendor: Vendor) => void;
    onValidationError?: (field: VendorFormField) => void;
    setError: (value: string | null) => void;
    setIsSubmitting: (value: boolean) => void;
    t: SafeTFunction;
}

export function useVendorSubmit({
    formData,
    initialData,
    isEdit,
    onSaved,
    onValidationError,
    setError,
    setIsSubmitting,
    t,
}: UseVendorSubmitOptions) {
    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        const validation = validateVendorFormFields(formData, t);
        if (validation.message && validation.field) {
            setError(validation.message);
            onValidationError?.(validation.field);
            return;
        }

        try {
            setIsSubmitting(true);
            const saved =
                isEdit && initialData
                    ? await vendorApi.updateVendor(
                        initialData.id,
                        buildVendorUpdatePayload(formData, initialData),
                    )
                    : await vendorApi.createVendor(buildVendorPayload(formData) as VendorCreate);
            onSaved(saved);
        } catch {
            setError(t('errors.save_failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        handleSubmit,
    };
}
