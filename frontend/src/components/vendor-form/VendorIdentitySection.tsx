import { useTranslation } from '@/i18n/hooks';
import { vendorValueOptions } from '@/lib/vendorValues';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

import type { VendorFormField } from './vendorForm.types';
import { vendorTypeOptions } from './vendorForm.types';

interface VendorIdentitySectionProps {
    formData: {
        country?: string | null;
        description?: string | null;
        legal_name?: string | null;
        name?: string | null;
        registration_id?: string | null;
        vendor_type?: string | null;
        website?: string | null;
    };
    onChange: (field: VendorFormField, value: unknown) => void;
    /** Field-level validation message for the required name (announced through `Field`). */
    nameError?: string | null;
}

export function VendorIdentitySection({ formData, onChange, nameError }: VendorIdentitySectionProps) {
    const { t } = useTranslation('vendors');

    return (
        <Card as="section">
            <CardHeader title={t('form.sections.identity')} />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={t('form.name')} required error={nameError}>
                    {(control) => (
                        <Input
                            {...control}
                            data-testid="vendor-form-name"
                            value={formData.name || ''}
                            onChange={(event) => onChange('name', event.target.value)}
                            placeholder={t('form.name_placeholder')}
                        />
                    )}
                </Field>

                <Field label={t('form.vendor_type.label')}>
                    {(control) => (
                        <ThemedSelect
                            {...control}
                            value={(formData.vendor_type || 'other') as string}
                            onValueChange={(value) => onChange('vendor_type', value)}
                            options={vendorTypeOptions.map((option) => ({
                                value: option.value,
                                label: t(option.labelKey),
                            }))}
                        />
                    )}
                </Field>

                <Field label={t('form.legal_name')}>
                    {(control) => (
                        <Input
                            {...control}
                            value={formData.legal_name || ''}
                            onChange={(event) => onChange('legal_name', event.target.value)}
                        />
                    )}
                </Field>

                <Field label={t('form.registration_id')}>
                    {(control) => (
                        <Input
                            {...control}
                            value={formData.registration_id || ''}
                            onChange={(event) => onChange('registration_id', event.target.value)}
                        />
                    )}
                </Field>

                <Field label={t('form.country')}>
                    {(control) => (
                        <ThemedSelect
                            {...control}
                            value={formData.country || ''}
                            onValueChange={(value) => onChange('country', value || null)}
                            options={vendorValueOptions(t, 'country')}
                            allowEmpty
                            emptyLabel={t('form.register.not_set')}
                            placeholder={t('form.register.not_set')}
                        />
                    )}
                </Field>

                <Field label={t('form.website')}>
                    {(control) => (
                        <Input
                            {...control}
                            value={formData.website || ''}
                            onChange={(event) => onChange('website', event.target.value)}
                        />
                    )}
                </Field>

                <Field label={t('form.description')} className="md:col-span-2">
                    {(control) => (
                        <Textarea
                            {...control}
                            value={formData.description || ''}
                            onChange={(event) => onChange('description', event.target.value)}
                            rows={3}
                        />
                    )}
                </Field>
            </div>
        </Card>
    );
}
