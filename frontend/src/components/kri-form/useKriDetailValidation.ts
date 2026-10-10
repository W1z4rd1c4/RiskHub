import { useState } from 'react';

import { getKriDraftValidationErrorKey } from '@/components/kri/kriFormValidation';
import { useFocusFirstInvalidField } from '@/hooks/useFocusFirstInvalidField';
import type { SafeTFunction } from '@/i18n/hooks';
import type { KRICreate } from '@/types/kri';

import type { KriDetailFieldErrors } from './KriDetailsStep';

/** Which details field a draft validation key belongs to (AX-04: per-field errors). */
const KRI_DETAIL_ERROR_FIELDS: Readonly<Record<string, keyof KriDetailFieldErrors>> = {
    'kris:form.validation.metric_name_required': 'metric_name',
    'kris:form.validation.description_required': 'description',
};

/**
 * Details-step validation for the KRI create wizard: a missing name or
 * description is shown on its field (not in the form banner), focused through
 * `formRef` (put it on the wizard's `<form>`), and cleared as soon as the user
 * edits that field.
 */
export function useKriDetailValidation({
    formData,
    setFormError,
    setFormField,
    t,
}: {
    formData: Partial<KRICreate> | undefined;
    setFormError: (error: string | null) => void;
    setFormField: (field: keyof KRICreate, value: KRICreate[keyof KRICreate] | undefined) => void;
    t: SafeTFunction;
}) {
    const [detailErrors, setDetailErrors] = useState<KriDetailFieldErrors>({});
    // Changes only on a failed check; the returned form ref then focuses the invalid field (§4.8).
    const [failedCheckCount, setFailedCheckCount] = useState(0);
    const formRef = useFocusFirstInvalidField(failedCheckCount);

    const validateDetails = () => {
        const errorKey = getKriDraftValidationErrorKey(formData ?? {});
        if (!errorKey) {
            setDetailErrors({});
            return true;
        }
        const field = KRI_DETAIL_ERROR_FIELDS[errorKey];
        if (field) {
            setFormError(null);
            setDetailErrors({ [field]: t(errorKey) });
            setFailedCheckCount((count) => count + 1);
        } else {
            setFormError(t(errorKey));
        }
        return false;
    };

    const handleInputChange = (field: keyof KRICreate, value: KRICreate[keyof KRICreate] | undefined) => {
        if (field in detailErrors) {
            setDetailErrors((current) => ({ ...current, [field]: undefined }));
        }
        setFormField(field, value);
    };

    return { detailErrors, formRef, handleInputChange, validateDetails };
}
