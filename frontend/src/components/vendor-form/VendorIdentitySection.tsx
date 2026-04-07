import { useTranslation } from '@/i18n/hooks';
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
                <div className="vendor-field">
                    <label className="vendor-label">{t('form.name')}</label>
                    <input
                        value={formData.name || ''}
                        onChange={(event) => onChange('name', event.target.value)}
                        className="vendor-input"
                        placeholder={t('form.name_placeholder')}
                    />
                </div>

                <div className="vendor-field">
                    <label className="vendor-label">{t('form.vendor_type.label')}</label>
                    <ThemedSelect
                        value={(formData.vendor_type || 'other') as string}
                        onValueChange={(value) => onChange('vendor_type', value)}
                        options={vendorTypeOptions.map((option) => ({
                            value: option.value,
                            label: t(option.labelKey),
                        }))}
                    />
                </div>

                <div className="vendor-field">
                    <label className="vendor-label">{t('form.legal_name')}</label>
                    <input
                        value={formData.legal_name || ''}
                        onChange={(event) => onChange('legal_name', event.target.value)}
                        className="vendor-input"
                    />
                </div>

                <div className="vendor-field">
                    <label className="vendor-label">{t('form.registration_id')}</label>
                    <input
                        value={formData.registration_id || ''}
                        onChange={(event) => onChange('registration_id', event.target.value)}
                        className="vendor-input"
                    />
                </div>

                <div className="vendor-field">
                    <label className="vendor-label">{t('form.country')}</label>
                    <input
                        value={formData.country || ''}
                        onChange={(event) => onChange('country', event.target.value)}
                        className="vendor-input"
                    />
                </div>

                <div className="vendor-field">
                    <label className="vendor-label">{t('form.website')}</label>
                    <input
                        value={formData.website || ''}
                        onChange={(event) => onChange('website', event.target.value)}
                        className="vendor-input"
                    />
                </div>

                <div className="vendor-field md:col-span-2">
                    <label className="vendor-label">{t('form.description')}</label>
                    <textarea
                        value={formData.description || ''}
                        onChange={(event) => onChange('description', event.target.value)}
                        rows={3}
                        className="vendor-textarea"
                    />
                </div>
            </div>
        </VendorSurface>
    );
}
