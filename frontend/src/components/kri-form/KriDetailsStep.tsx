import { KRIVendorSelector, type KRIVendorOption } from '@/components/kri/KRIVendorSelector';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { KRIFrequencies, type KRICreate, type KRIFrequency } from '@/types/kri';

import type { KRIFormVendorContext, KriVisibleUser } from './kriForm.types';

/** Per-field validation messages (AX-04), already translated. */
export type KriDetailFieldErrors = Partial<Record<'metric_name' | 'description', string>>;

interface KriDetailsStepProps {
    formData: Partial<KRICreate>;
    fieldErrors?: KriDetailFieldErrors;
    isLoadingVendors: boolean;
    onInputChange: (field: keyof KRICreate, value: KRICreate[keyof KRICreate] | undefined) => void;
    onSelectedVendorIdsChange: (vendorIds: number[]) => void;
    onVendorSearchChange: (value: string) => void;
    selectedVendorIds: number[];
    selectedVendorOptions: KRIVendorOption[];
    users: KriVisibleUser[];
    vendorContext: KRIFormVendorContext | null;
    vendorOptions: KRIVendorOption[];
    vendorSearch: string;
}

export function KriDetailsStep({
    formData,
    fieldErrors = {},
    isLoadingVendors,
    onInputChange,
    onSelectedVendorIdsChange,
    onVendorSearchChange,
    selectedVendorIds,
    selectedVendorOptions,
    users,
    vendorContext,
    vendorOptions,
    vendorSearch,
}: KriDetailsStepProps) {
    const { t } = useTranslation(['common', 'kris']);

    return (
        <section className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-eyebrow mb-4">
                {t('kris:form.details_heading')}
            </h2>

            <div className="space-y-6">
                <Field label={t('kris:fields.name')} required error={fieldErrors.metric_name}>
                    {(field) => (
                        <Input
                            {...field}
                            type="text"
                            value={formData.metric_name}
                            onChange={(event) => onInputChange('metric_name', event.target.value)}
                            placeholder={t('kris:form.placeholders.metric_name')}
                        />
                    )}
                </Field>

                <Field label={t('common:labels.description')} required error={fieldErrors.description}>
                    {(field) => (
                        <Textarea
                            {...field}
                            rows={3}
                            value={formData.description}
                            onChange={(event) => onInputChange('description', event.target.value)}
                            placeholder={t('kris:form.placeholders.description')}
                        />
                    )}
                </Field>

                <div className="grid gap-4 md:grid-cols-3">
                    <Field label={t('kris:fields.current_value')} required>
                        {(field) => (
                            <Input
                                {...field}
                                type="number"
                                step="0.01"
                                value={formData.current_value}
                                onChange={(event) =>
                                    onInputChange('current_value', parseFloat(event.target.value) || 0)
                                }
                            />
                        )}
                    </Field>
                    <Field label={t('kris:fields.lower_limit')}>
                        {(field) => (
                            <Input
                                {...field}
                                type="number"
                                step="0.01"
                                value={formData.lower_limit}
                                onChange={(event) =>
                                    onInputChange('lower_limit', parseFloat(event.target.value) || 0)
                                }
                            />
                        )}
                    </Field>
                    <Field label={t('kris:fields.upper_limit')}>
                        {(field) => (
                            <Input
                                {...field}
                                type="number"
                                step="0.01"
                                value={formData.upper_limit}
                                onChange={(event) =>
                                    onInputChange('upper_limit', parseFloat(event.target.value) || 0)
                                }
                            />
                        )}
                    </Field>
                </div>

                <Field label={t('kris:fields.unit')}>
                    {(field) => (
                        <ThemedSelect
                            {...field}
                            value={formData.unit || '%'}
                            onValueChange={(value) => onInputChange('unit', value)}
                            className="w-full"
                            options={[
                                { value: '%', label: t('kris:form.units.percentage') },
                                { value: 'count', label: t('kris:form.units.count') },
                                { value: 'days', label: t('kris:form.units.days') },
                                { value: 'hours', label: t('kris:form.units.hours') },
                                { value: 'CZK', label: 'CZK' },
                                { value: 'EUR', label: 'EUR' },
                                { value: 'ratio', label: t('kris:form.units.ratio') },
                            ]}
                        />
                    )}
                </Field>

                <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
                    <Field label={t('kris:fields.frequency')}>
                        {(field) => (
                            <ThemedSelect
                                {...field}
                                value={formData.frequency || 'quarterly'}
                                onValueChange={(value) => {
                                    if ((KRIFrequencies as readonly string[]).includes(value)) {
                                        onInputChange('frequency', value as KRIFrequency);
                                    }
                                }}
                                className="w-full"
                                options={[
                                    { value: 'daily', label: t('kris:frequencies.daily') },
                                    { value: 'weekly', label: t('kris:frequencies.weekly') },
                                    { value: 'monthly', label: t('kris:frequencies.monthly') },
                                    { value: 'quarterly', label: t('kris:frequencies.quarterly') },
                                    { value: 'annually', label: t('kris:frequencies.annually') },
                                ]}
                            />
                        )}
                    </Field>
                    <Field label={t('kris:fields.owner')} help={t('kris:form.reporting_owner_hint')}>
                        {(field) => (
                            <ThemedSelect
                                {...field}
                                value={formData.reporting_owner_id?.toString() ?? ''}
                                onValueChange={(value) =>
                                    onInputChange('reporting_owner_id', value ? parseInt(value, 10) : undefined)
                                }
                                placeholder={t('kris:form.placeholders.reporting_owner_default')}
                                allowEmpty
                                emptyLabel={t('kris:form.placeholders.reporting_owner_default')}
                                className="w-full"
                                options={users.map((user) => ({
                                    value: user.id.toString(),
                                    label: `${user.name} (${user.email})`,
                                }))}
                            />
                        )}
                    </Field>
                </div>

                <div className="border-t border-border pt-4">
                    <KRIVendorSelector
                        vendors={vendorOptions}
                        selectedVendorIds={selectedVendorIds}
                        selectedVendorOptions={selectedVendorOptions}
                        onChange={onSelectedVendorIdsChange}
                        isLoading={isLoadingVendors}
                        search={vendorSearch}
                        onSearchChange={onVendorSearchChange}
                        emptyStateLabel={
                            vendorSearch.trim().length > 0
                                ? t('kris:vendor_assignment.empty_search')
                                : t('kris:vendor_assignment.empty')
                        }
                    />
                    {vendorContext ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                            {t('kris:vendor_assignment.vendor_context_auto_linked')}
                        </p>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
