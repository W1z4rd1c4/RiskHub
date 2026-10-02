import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import type { KriModalFormData, KriModalTranslate } from './kriModalTypes';

interface KriMetricFieldsProps {
    clearError: () => void;
    formData: KriModalFormData;
    t: KriModalTranslate;
    updateFormData: (update: KriModalFormData) => void;
}

export function KriMetricFields({
    clearError,
    formData,
    t,
    updateFormData,
}: KriMetricFieldsProps) {
    return (
        <>
            <Field label={t('modal.metric_name', { ns: 'kris' })} required>
                {(field) => (
                    <Input
                        {...field}
                        type="text"
                        placeholder={t('form.placeholders.metric_name')}
                        value={formData.metric_name}
                        onChange={(event) => {
                            updateFormData({ metric_name: event.target.value });
                            clearError();
                        }}
                    />
                )}
            </Field>

            <Field label={t('fields.description', { ns: 'kris' })} required>
                {(field) => (
                    <Textarea
                        {...field}
                        rows={3}
                        value={formData.description}
                        onChange={(event) => {
                            updateFormData({ description: event.target.value });
                            clearError();
                        }}
                        placeholder={t('form.placeholders.description', { ns: 'kris' })}
                    />
                )}
            </Field>

            <div className="grid grid-cols-2 gap-6">
                <Field label={t('modal.current_value_readonly', { ns: 'kris' })}>
                    {(field) => (
                        <Input
                            {...field}
                            type="number"
                            value={formData.current_value}
                            disabled
                            className="font-mono"
                        />
                    )}
                </Field>
                <Field label={t('modal.unit_examples', { ns: 'kris' })}>
                    {(field) => (
                        <Input
                            {...field}
                            type="text"
                            value={formData.unit}
                            onChange={(event) => updateFormData({ unit: event.target.value })}
                        />
                    )}
                </Field>
            </div>
        </>
    );
}
