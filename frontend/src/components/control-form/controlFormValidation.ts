import type { SafeTFunction } from '@/i18n/hooks';
import type { Control } from '@/types/control';

export function getControlFormStepError(
    stepIndex: number,
    formData: Partial<Control>,
    t: SafeTFunction,
): string | null {
    switch (stepIndex) {
        case 0:
            if (!formData.name?.trim()) {
                return t('controls:form.validation.name_required');
            }
            if (!formData.description?.trim()) {
                return t('controls:form.validation.description_required');
            }
            return null;
        case 1:
            if (!formData.control_owner_id) {
                return t('controls:form.validation.owner_required');
            }
            if (!formData.process_owner_position?.trim()) {
                return t('controls:form.validation.owner_position_required');
            }
            if (!formData.department_id) {
                return t('controls:form.validation.department_required');
            }
            return null;
        case 2:
            if (!formData.data_source?.trim()) {
                return t('controls:form.validation.data_source_required');
            }
            if (!formData.methodology_reference?.trim()) {
                return t('controls:form.validation.methodology_reference_required');
            }
            return null;
        default:
            return null;
    }
}

export function getControlFormSubmissionError(formData: Partial<Control>, t: SafeTFunction): string | null {
    return (
        getControlFormStepError(0, formData, t) ??
        getControlFormStepError(1, formData, t) ??
        getControlFormStepError(2, formData, t)
    );
}
