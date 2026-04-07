import type { SafeTFunction } from '@/i18n/hooks';
import { vendorApi } from '@/services/vendorApi';
import type { Vendor } from '@/types/vendor';
import type { VendorCreate } from '@/types/vendor';

import { buildVendorPayload, validateVendorForm } from './vendorForm.mappers';
import type { VendorFormData } from './vendorForm.types';

interface UseVendorSubmitOptions {
    formData: VendorFormData;
    initialData?: Vendor;
    isEdit: boolean;
    onSaved: (vendor: Vendor) => void;
    setError: (value: string | null) => void;
    setIsSubmitting: (value: boolean) => void;
    t: SafeTFunction;
}

export function useVendorSubmit({
    formData,
    initialData,
    isEdit,
    onSaved,
    setError,
    setIsSubmitting,
    t,
}: UseVendorSubmitOptions) {
    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        const validationError = validateVendorForm(formData, t);
        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setIsSubmitting(true);
            const payload = buildVendorPayload(formData);
            const saved =
                isEdit && initialData
                    ? await vendorApi.updateVendor(initialData.id, payload)
                    : await vendorApi.createVendor(payload as VendorCreate);
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
