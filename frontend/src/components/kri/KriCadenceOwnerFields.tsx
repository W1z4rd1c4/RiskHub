import { Calendar, User } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { KRIFrequencies, type KRIFrequency } from '@/types/kri';

import type { KriModalFormData, KriModalTranslate, KriOwnerOption } from './kriModalTypes';

interface KriCadenceOwnerFieldsProps {
    formData: KriModalFormData;
    t: KriModalTranslate;
    updateFormData: (update: KriModalFormData) => void;
    users: KriOwnerOption[];
}

export function KriCadenceOwnerFields({
    formData,
    t,
    updateFormData,
    users,
}: KriCadenceOwnerFieldsProps) {
    return (
        <div className="grid grid-cols-2 gap-6 pt-6 border-t border-border">
            <Field
                label={(
                    <span className="inline-flex items-center gap-1">
                        <Calendar aria-hidden="true" className="h-3 w-3" />
                        {t('fields.frequency', { ns: 'kris' })}
                    </span>
                )}
            >
                {(field) => (
                    <ThemedSelect
                        {...field}
                        value={formData.frequency || 'quarterly'}
                        onValueChange={(value) => {
                            if ((KRIFrequencies as readonly string[]).includes(value)) {
                                updateFormData({ frequency: value as KRIFrequency });
                            }
                        }}
                        className="w-full"
                        options={[
                            { value: 'daily', label: t('frequencies.daily', { ns: 'kris' }) },
                            { value: 'weekly', label: t('frequencies.weekly', { ns: 'kris' }) },
                            { value: 'monthly', label: t('frequencies.monthly', { ns: 'kris' }) },
                            { value: 'quarterly', label: t('frequencies.quarterly', { ns: 'kris' }) },
                            { value: 'annually', label: t('frequencies.annually', { ns: 'kris' }) },
                        ]}
                    />
                )}
            </Field>
            <Field
                label={(
                    <span className="inline-flex items-center gap-1">
                        <User aria-hidden="true" className="h-3 w-3" />
                        {t('fields.owner', { ns: 'kris' })}
                    </span>
                )}
            >
                {(field) => (
                    <ThemedSelect
                        {...field}
                        value={formData.reporting_owner_id?.toString() ?? ''}
                        onValueChange={(value) =>
                            updateFormData({
                                reporting_owner_id: value ? Number.parseInt(value, 10) : undefined,
                            })
                        }
                        placeholder={t('form.placeholders.reporting_owner_default')}
                        allowEmpty
                        emptyLabel={t('form.placeholders.reporting_owner_default')}
                        className="w-full"
                        options={users.map((user) => ({ value: user.id.toString(), label: user.name }))}
                    />
                )}
            </Field>
        </div>
    );
}
