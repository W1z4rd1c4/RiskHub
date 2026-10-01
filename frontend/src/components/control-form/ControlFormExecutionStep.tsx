import type { Control } from '@/types/control';
import { ControlForm as ControlFormType, ControlFrequency } from '@/types/control';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

const formatFrequencyLabel = (value: string): string =>
    value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

interface ControlFormExecutionStepProps {
    formData: Partial<Control>;
    handleInputChange: (field: keyof Control, value: unknown) => void;
    t: (key: string, options?: Record<string, unknown>) => string;
}

export function ControlFormExecutionStep({ formData, handleInputChange, t }: ControlFormExecutionStepProps) {
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
                            options={Object.values(ControlFrequency).map((frequency) => ({ value: frequency, label: formatFrequencyLabel(frequency) }))}
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
                            options={Object.values(ControlFormType).map((form) => ({ value: form, label: form.toUpperCase() }))}
                        />
                    )}
                </Field>
            </div>
            <Field label={t('controls:form.labels.data_source_methodology')} group>
                {(field) => (
                    <div className="space-y-4" role="group" aria-labelledby={field['aria-labelledby']}>
                        <Input
                            type="text"
                            aria-label={t('form.placeholders.data_source')}
                            value={formData.data_source || ''}
                            onChange={(event) => handleInputChange('data_source', event.target.value)}
                            placeholder={t('form.placeholders.data_source')}
                        />
                        <Input
                            type="text"
                            aria-label={t('form.placeholders.methodology_reference')}
                            value={formData.methodology_reference || ''}
                            onChange={(event) => handleInputChange('methodology_reference', event.target.value)}
                            placeholder={t('form.placeholders.methodology_reference')}
                        />
                    </div>
                )}
            </Field>
        </div>
    );
}
