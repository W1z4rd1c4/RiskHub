import { useTranslation } from '@/i18n/hooks';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import {
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';

import type { VendorFormField } from './vendorForm.types';
import { replaceabilityOptions } from './vendorForm.types';

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
        <VendorSurface className="space-y-5">
            <VendorSectionHeader title={t('form.sections.resilience', 'Resilience & Monitoring')} />

            <div className="vendor-form-grid">
                <div className="vendor-field">
                    <label className="vendor-label">{t('form.replaceability.label')}</label>
                    <ThemedSelect
                        value={formData.replaceability ? String(formData.replaceability) : ''}
                        onValueChange={(value) => onChange('replaceability', value || null)}
                        placeholder={t('form.replaceability.placeholder')}
                        allowEmpty
                        emptyLabel={t('form.replaceability.placeholder')}
                        options={replaceabilityOptions.map((option) => ({
                            value: option.value,
                            label: t(option.labelKey),
                        }))}
                    />
                </div>
                <div className="vendor-field md:col-span-2">
                    <label className="vendor-label">{t('flags.has_alternatives')}</label>
                    <label className="vendor-checkbox">
                        <input
                            type="checkbox"
                            checked={!!formData.has_alternative_providers}
                            onChange={(event) => onChange('has_alternative_providers', event.target.checked)}
                            className="accent-accent"
                        />
                        {t('flags.has_alternatives')}
                    </label>
                </div>
            </div>
        </VendorSurface>
    );
}
