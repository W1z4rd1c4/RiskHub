import { useTranslation } from '@/i18n/hooks';
import { vendorValueOptions } from '@/lib/vendorValues';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import {
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';

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
}

export function VendorIdentitySection({ formData, onChange }: VendorIdentitySectionProps) {
    const { t } = useTranslation('vendors');

    return (
        <VendorSurface tone="emphasis" className="space-y-5">
            <VendorSectionHeader title={t('form.sections.identity')} />

            <div className="vendor-form-grid">
                <Field label={t('form.name')} labelClassName="vendor-label" className="vendor-field space-y-0">
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

                <Field label={t('form.vendor_type.label')} labelClassName="vendor-label" className="vendor-field space-y-0">
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

                <Field label={t('form.legal_name')} labelClassName="vendor-label" className="vendor-field space-y-0">
                    {(control) => (
                        <Input
                            {...control}
                            value={formData.legal_name || ''}
                            onChange={(event) => onChange('legal_name', event.target.value)}
                        />
                    )}
                </Field>

                <Field label={t('form.registration_id')} labelClassName="vendor-label" className="vendor-field space-y-0">
                    {(control) => (
                        <Input
                            {...control}
                            value={formData.registration_id || ''}
                            onChange={(event) => onChange('registration_id', event.target.value)}
                        />
                    )}
                </Field>

                <Field label={t('form.country')} labelClassName="vendor-label" className="vendor-field space-y-0">
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

                <Field label={t('form.website')} labelClassName="vendor-label" className="vendor-field space-y-0">
                    {(control) => (
                        <Input
                            {...control}
                            value={formData.website || ''}
                            onChange={(event) => onChange('website', event.target.value)}
                        />
                    )}
                </Field>

                <Field label={t('form.description')} labelClassName="vendor-label" className="vendor-field space-y-0 md:col-span-2">
                    {(control) => (
                        <textarea
                            {...control}
                            value={formData.description || ''}
                            onChange={(event) => onChange('description', event.target.value)}
                            rows={3}
                            className="vendor-textarea"
                        />
                    )}
                </Field>
            </div>
        </VendorSurface>
    );
}
