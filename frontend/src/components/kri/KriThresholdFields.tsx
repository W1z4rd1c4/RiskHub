import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import type { KriModalFormData, KriModalTranslate } from './kriModalTypes';

interface KriThresholdFieldsProps {
    formData: KriModalFormData;
    t: KriModalTranslate;
    updateFormData: (update: KriModalFormData) => void;
}

export function KriThresholdFields({ formData, t, updateFormData }: KriThresholdFieldsProps) {
    return (
        <div className="grid grid-cols-2 gap-6 pt-6 border-t border-border">
            <Field label={t('modal.lower_limit_breach', { ns: 'kris' })} labelClassName="text-destructive">
                {(field) => (
                    <Input
                        {...field}
                        type="number"
                        value={formData.lower_limit}
                        onChange={(event) => updateFormData({ lower_limit: Number.parseFloat(event.target.value) })}
                        className="font-mono border-destructive/40"
                    />
                )}
            </Field>
            <Field label={t('modal.upper_limit_breach', { ns: 'kris' })} labelClassName="text-destructive">
                {(field) => (
                    <Input
                        {...field}
                        type="number"
                        value={formData.upper_limit}
                        onChange={(event) => updateFormData({ upper_limit: Number.parseFloat(event.target.value) })}
                        className="font-mono border-destructive/40"
                    />
                )}
            </Field>
        </div>
    );
}
