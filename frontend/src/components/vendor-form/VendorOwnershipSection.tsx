import { useTranslation } from '@/i18n/hooks';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import {
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';

import { VendorSuggestions } from './VendorSuggestions';
import type { VendorFormField, VendorOption } from './vendorForm.types';

interface VendorOwnershipSectionProps {
    departmentOptions: VendorOption[];
    formData: {
        department_id?: number | null;
        outsourcing_owner_user_id?: number | null;
        process?: string | null;
        subprocess?: string | null;
    };
    onChange: (field: VendorFormField, value: unknown) => void;
    ownerOptions: VendorOption[];
    processSuggestions: string[];
    subprocessSuggestions: string[];
}

export function VendorOwnershipSection({
    departmentOptions,
    formData,
    onChange,
    ownerOptions,
    processSuggestions,
    subprocessSuggestions,
}: VendorOwnershipSectionProps) {
    const { t } = useTranslation('vendors');

    return (
        <VendorSurface className="space-y-5">
            <VendorSectionHeader title={t('form.sections.ownership')} />

            <div className="vendor-form-grid">
                <div className="vendor-field">
                    <label className="vendor-label">{t('form.department')}</label>
                    <ThemedSelect
                        value={formData.department_id ? String(formData.department_id) : ''}
                        onValueChange={(value) => onChange('department_id', value ? Number(value) : null)}
                        placeholder={t('form.department_placeholder')}
                        allowEmpty
                        emptyLabel={t('form.department_placeholder')}
                        options={departmentOptions}
                    />
                </div>

                <div className="vendor-field">
                    <label className="vendor-label">{t('form.owner')}</label>
                    <ThemedSelect
                        value={formData.outsourcing_owner_user_id ? String(formData.outsourcing_owner_user_id) : ''}
                        onValueChange={(value) => onChange('outsourcing_owner_user_id', value ? Number(value) : 0)}
                        placeholder={t('form.owner_placeholder')}
                        allowEmpty
                        emptyLabel={t('form.owner_placeholder')}
                        options={ownerOptions}
                    />
                </div>

                <div className="vendor-field relative">
                    <label className="vendor-label">{t('form.process')}</label>
                    <input
                        value={formData.process || ''}
                        onChange={(event) => onChange('process', event.target.value)}
                        className="vendor-input"
                        placeholder={t('form.process_placeholder')}
                    />
                    {(formData.process || '').length > 0 ? (
                        <VendorSuggestions items={processSuggestions} onSelect={(value) => onChange('process', value)} />
                    ) : null}
                </div>

                <div className="vendor-field relative">
                    <label className="vendor-label">{t('form.subprocess')}</label>
                    <input
                        value={formData.subprocess || ''}
                        onChange={(event) => onChange('subprocess', event.target.value)}
                        className="vendor-input"
                        placeholder={t('form.subprocess_placeholder')}
                    />
                    {(formData.subprocess || '').length > 0 ? (
                        <VendorSuggestions
                            items={subprocessSuggestions}
                            onSelect={(value) => onChange('subprocess', value)}
                        />
                    ) : null}
                </div>
            </div>
        </VendorSurface>
    );
}
