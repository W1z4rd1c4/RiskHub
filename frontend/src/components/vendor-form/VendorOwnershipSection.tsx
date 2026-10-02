import { useTranslation } from '@/i18n/hooks';
import { Card, CardHeader } from '@/components/ui/card';
import { CreatableCombobox } from '@/components/ui/CreatableCombobox';
import { Field } from '@/components/ui/field';
import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

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
    /** Field-level validation messages for the required fields (announced through `Field`). */
    errors?: Partial<Record<'department_id' | 'outsourcing_owner_user_id' | 'process', string | null>>;
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
    errors = {},
}: VendorOwnershipSectionProps) {
    const { t } = useTranslation('vendors');

    return (
        <Card as="section">
            <CardHeader title={t('form.sections.ownership')} />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={t('form.department')} required error={errors.department_id}>
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
                    error={errors.outsourcing_owner_user_id}
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

                {/* Free text with suggestions from existing vendors (a new process is allowed). */}
                <Field label={t('form.process')} required error={errors.process}>
                    {(control) => (
                        <CreatableCombobox
                            {...control}
                            data-testid="vendor-form-process"
                            value={formData.process || ''}
                            suggestions={processSuggestions}
                            onValueChange={(value) => onChange('process', value)}
                            placeholder={t('form.process_placeholder')}
                        />
                    )}
                </Field>

                <Field label={t('form.subprocess')}>
                    {(control) => (
                        <CreatableCombobox
                            {...control}
                            value={formData.subprocess || ''}
                            suggestions={subprocessSuggestions}
                            onValueChange={(value) => onChange('subprocess', value)}
                            placeholder={t('form.subprocess_placeholder')}
                        />
                    )}
                </Field>
            </div>
        </Card>
    );
}
