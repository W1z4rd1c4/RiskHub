import type { SafeTFunction } from '@/i18n/hooks';
import type { Control } from '@/types/control';

/** A validation failure tied to the field that shows it (AX-04: per-field errors). */
export interface ControlFormFieldError {
    field: keyof Control;
    message: string;
}

/** Required fields per wizard step, in the order they are checked. */
const CONTROL_FORM_STEP_RULES: Readonly<Record<number, ReadonlyArray<{ field: keyof Control; key: string }>>> = {
    0: [
        { field: 'name', key: 'controls:form.validation.name_required' },
        { field: 'description', key: 'controls:form.validation.description_required' },
    ],
    1: [
        { field: 'control_owner_id', key: 'controls:form.validation.owner_required' },
        { field: 'process_owner_position', key: 'controls:form.validation.owner_position_required' },
        { field: 'department_id', key: 'controls:form.validation.department_required' },
    ],
    2: [
        { field: 'data_source', key: 'controls:form.validation.data_source_required' },
        { field: 'methodology_reference', key: 'controls:form.validation.methodology_reference_required' },
    ],
};

function isMissing(value: unknown): boolean {
    if (typeof value === 'string') return !value.trim();
    return !value;
}

/** The first missing required field of a step, with its translated message. */
export function getControlFormStepFieldError(
    stepIndex: number,
    formData: Partial<Control>,
    t: SafeTFunction,
): ControlFormFieldError | null {
    const rule = (CONTROL_FORM_STEP_RULES[stepIndex] ?? []).find(({ field }) => isMissing(formData[field]));
    return rule ? { field: rule.field, message: t(rule.key) } : null;
}

export function getControlFormStepError(
    stepIndex: number,
    formData: Partial<Control>,
    t: SafeTFunction,
): string | null {
    return getControlFormStepFieldError(stepIndex, formData, t)?.message ?? null;
}

export function getControlFormSubmissionError(formData: Partial<Control>, t: SafeTFunction): string | null {
    return (
        getControlFormStepError(0, formData, t) ??
        getControlFormStepError(1, formData, t) ??
        getControlFormStepError(2, formData, t)
    );
}
