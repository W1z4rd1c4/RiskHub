import type { Control } from '@/types/control';
import { ControlForm as ControlFormType, ControlFrequency } from '@/types/control';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { formatControlForm, formatControlFrequency } from '@/pages/controls/controlsPagePresentation';

interface ControlFormExecutionStepProps {
    formData: Partial<Control>;
    /** Per-field validation messages (AX-04). */
    fieldErrors?: Partial<Record<keyof Control, string>>;
    handleInputChange: (field: keyof Control, value: unknown) => void;
    t: (key: string, options?: Record<string, unknown>) => string;
}

export function ControlFormExecutionStep({ formData, fieldErrors = {}, handleInputChange, t }: ControlFormExecutionStepProps) {
    // GAP-D-01: translated enum labels (no regex "prettifying", no upper-casing).
    const translateEnum = (key: string, fallback: string) => t(key, { defaultValue: fallback });
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="grid md:grid-cols-2 gap-6">
                <Field label={t('common:labels.frequency')}>
                    {(field) => (
                        <ThemedSelect
                            {...field}
                            value={formData.frequency || ControlFrequency.MONTHLY}
                            onValueChange={(value) => handleInputChange('frequency', value)}
                            className="w-full"
                            options={Object.values(ControlFrequency).map((frequency) => ({ value: frequency, label: formatControlFrequency(frequency, translateEnum) }))}
                        />
                    )}
                </Field>
                <Field label={t('common:labels.form')}>
                    {(field) => (
                        <ThemedSelect
                            {...field}
                            value={formData.control_form || ControlFormType.MANUAL}
                            onValueChange={(value) => handleInputChange('control_form', value)}
                            className="w-full"
                            options={Object.values(ControlFormType).map((form) => ({ value: form, label: formatControlForm(form, translateEnum) }))}
                        />
                    )}
                </Field>
            </div>
            <fieldset className="space-y-4">
                <legend className="mb-2 text-sm font-medium text-foreground">{t('controls:form.labels.data_source_methodology')}</legend>
                <Field label={t('controls:form.labels.data_source')} required error={fieldErrors.data_source}>
                    {(field) => (
                        <Input
                            {...field}
                            type="text"
                            value={formData.data_source || ''}
                            onChange={(event) => handleInputChange('data_source', event.target.value)}
                            placeholder={t('form.placeholders.data_source')}
                        />
                    )}
                </Field>
                <Field label={t('controls:form.labels.methodology_reference')} required error={fieldErrors.methodology_reference}>
                    {(field) => (
                        <Input
                            {...field}
                            type="text"
                            value={formData.methodology_reference || ''}
                            onChange={(event) => handleInputChange('methodology_reference', event.target.value)}
                            placeholder={t('form.placeholders.methodology_reference')}
                        />
                    )}
                </Field>
            </fieldset>
        </div>
    );
}
