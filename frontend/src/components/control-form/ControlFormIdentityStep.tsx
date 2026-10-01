import type { Control } from '@/types/control';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface ControlFormIdentityStepProps {
    formData: Partial<Control>;
    handleInputChange: (field: keyof Control, value: unknown) => void;
    t: (key: string, options?: Record<string, unknown>) => string;
}

export function ControlFormIdentityStep({ formData, handleInputChange, t }: ControlFormIdentityStepProps) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <Field label={t('controls:fields.name')} required>
                {(field) => (
                    <Input
                        {...field}
                        type="text"
                        required
                        value={formData.name}
                        onChange={(event) => handleInputChange('name', event.target.value)}
                        placeholder={t('form.placeholders.name')}
                    />
                )}
            </Field>
            <Field label={t('common:labels.description')} required>
                {(field) => (
                    <Textarea
                        {...field}
                        required
                        rows={4}
                        value={formData.description}
                        onChange={(event) => handleInputChange('description', event.target.value)}
                        placeholder={t('form.placeholders.description')}
                    />
                )}
            </Field>
        </div>
    );
}
