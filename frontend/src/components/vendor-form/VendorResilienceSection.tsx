import { useTranslation } from '@/i18n/hooks';
import { vendorValueOptions } from '@/lib/vendorValues';
import { Card, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

import type { VendorFormField } from './vendorForm.types';

interface VendorResilienceSectionProps {
    formData: {
        has_alternative_providers?: boolean;
        replaceability?: string | null;
    };
    onChange: (field: VendorFormField, value: unknown) => void;
}

export function VendorResilienceSection({ formData, onChange }: VendorResilienceSectionProps) {
    const { t } = useTranslation('vendors');

    return (
        <Card as="section">
            <CardHeader title={t('form.sections.resilience')} />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={t('form.replaceability.label')}>
                    {(control) => (
                        <ThemedSelect
                            {...control}
                            value={formData.replaceability ? String(formData.replaceability) : ''}
                            onValueChange={(value) => onChange('replaceability', value || null)}
                            placeholder={t('form.replaceability.placeholder')}
                            allowEmpty
                            emptyLabel={t('form.replaceability.placeholder')}
                            options={vendorValueOptions(t, 'replaceability')}
                        />
                    )}
                </Field>
                <Field label={t('flags.has_alternatives')} layout="inline" className="md:col-span-2">
                    {(control) => (
                        <Checkbox
                            {...control}
                            checked={!!formData.has_alternative_providers}
                            onCheckedChange={(checked) => onChange('has_alternative_providers', checked)}
                        />
                    )}
                </Field>
            </div>
        </Card>
    );
}
