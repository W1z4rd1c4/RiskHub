import type { SafeTFunction } from '@/i18n/hooks';
import { vendorApi } from '@/services/vendorApi';
import type { Vendor } from '@/types/vendor';
import type { VendorCreate } from '@/types/vendor';
import {
    isProcessApprovalQueuedResponse,
    type ProcessApprovalQueuedResponse,
} from '@/types/process';

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
    onApprovalQueued?: (queued: ProcessApprovalQueuedResponse) => void;
    requestReason: string;
    requestReasonRequired: boolean;
    onAccepted: () => void;
    onValidationError?: (field: VendorFormField | 'request_reason') => void;
    setError: (value: string | null) => void;
    setRequestReasonError: (value: string | null) => void;
    setIsSubmitting: (value: boolean) => void;
    t: SafeTFunction;
}

export function useVendorSubmit({
    formData,
    initialData,
    isEdit,
    onSaved,
    onApprovalQueued,
    requestReason,
    requestReasonRequired,
    onAccepted,
    onValidationError,
    setError,
    setRequestReasonError,
    setIsSubmitting,
    t,
}: UseVendorSubmitOptions) {
    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setRequestReasonError(null);

        const validation = validateVendorFormFields(formData, t);
        if (validation.message && validation.field) {
            setError(validation.message);
            onValidationError?.(validation.field);
            return;
        }
        if (requestReasonRequired && !requestReason.trim()) {
            const message = t('vendors:errors.request_reason_required');
            setError(message);
            setRequestReasonError(message);
            onValidationError?.('request_reason');
            return;
        }

        try {
            setIsSubmitting(true);
            const requestReasonPayload = requestReason.trim()
                ? { request_reason: requestReason.trim() }
                : {};
            const saved =
                isEdit && initialData
                    ? await vendorApi.updateVendor(
                        initialData.id,
                        {
                            ...buildVendorUpdatePayload(formData, initialData),
                            ...requestReasonPayload,
                        },
                    )
                    : await vendorApi.createVendor({
                        ...(buildVendorPayload(formData) as VendorCreate),
                        ...requestReasonPayload,
                    });
            onAccepted();
            if (isProcessApprovalQueuedResponse(saved)) {
                onApprovalQueued?.(saved);
                return;
            }
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
