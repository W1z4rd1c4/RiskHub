import { useTranslation } from '@/i18n/hooks';
import { Field } from '@/components/ui/field';
import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import {
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';

import { VendorSuggestions } from './VendorSuggestions';
import type { VendorFormField, VendorOption } from './vendorForm.types';

interface VendorOwnershipSectionProps {
    canManageAccountability: boolean;
    departmentOptions: VendorOption[];
    formData: {
        department_id?: number | null;
        outsourcing_owner_user_id?: number | null;
        process?: string | null;
        subprocess?: string | null;
    };
    onChange: (field: VendorFormField, value: unknown) => void;
    ownerSearch: string;
    ownerOptions: VendorOption[];
    processSuggestions: string[];
    subprocessSuggestions: string[];
    onOwnerSearchChange: (value: string) => void;
}

export function VendorOwnershipSection({
    canManageAccountability,
    departmentOptions,
    formData,
    onChange,
    ownerSearch,
    ownerOptions,
    processSuggestions,
    subprocessSuggestions,
    onOwnerSearchChange,
}: VendorOwnershipSectionProps) {
    const { t } = useTranslation('vendors');

    return (
        <VendorSurface className="space-y-5">
            <VendorSectionHeader title={t('form.sections.ownership')} />

            <div className="vendor-form-grid">
                <Field label={t('form.department')} required labelClassName="vendor-label" className="vendor-field space-y-0">
                    {(control) => (
                        <ThemedSelect
                            {...control}
                            value={formData.department_id ? String(formData.department_id) : ''}
                            onValueChange={(value) => onChange('department_id', value ? Number(value) : null)}
                            placeholder={t('form.department_placeholder')}
                            allowEmpty
                            emptyLabel={t('form.department_placeholder')}
                            options={departmentOptions}
                            triggerTestId="vendor-form-department"
                            disabled={!canManageAccountability}
                        />
                    )}
                </Field>

                <Field
                    label={t('form.owner')}
                    required
                    help={t('form.owner_help')}
                    labelClassName="vendor-label"
                    className="vendor-field space-y-0"
                >
                    {(control) => (
                        <SearchableEntitySelect
                            {...control}
                            value={formData.outsourcing_owner_user_id ? String(formData.outsourcing_owner_user_id) : ''}
                            onValueChange={(value) => onChange('outsourcing_owner_user_id', value ? Number(value) : 0)}
                            options={ownerOptions}
                            searchValue={ownerSearch}
                            onSearchChange={onOwnerSearchChange}
                            placeholder={t('form.owner_placeholder')}
                            searchPlaceholder={t('form.owner_search')}
                            triggerTestId="vendor-form-owner"
                            disabled={!canManageAccountability}
                        />
                    )}
                </Field>

                <div className="vendor-field relative">
                    <label className="vendor-label">{t('form.process')}</label>
                    <input
                        data-testid="vendor-form-process"
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
