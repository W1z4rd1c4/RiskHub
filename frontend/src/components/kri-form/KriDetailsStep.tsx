import { Calendar, User } from 'lucide-react';

import { KRIVendorSelector, type KRIVendorOption } from '@/components/kri/KRIVendorSelector';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { KRIFrequencies, type KRICreate, type KRIFrequency } from '@/types/kri';

import type { KRIFormVendorContext, KriVisibleUser } from './kriForm.types';

interface KriDetailsStepProps {
    formData: Partial<KRICreate>;
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
            <h3 className="mb-4 text-[10px] font-black uppercase tracking-widest text-white">
                {t('kris:fields.name')} {t('common:labels.details')}
            </h3>

            <div className="space-y-6">
                <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {t('kris:fields.name')} *
                    </label>
                    <input
                        type="text"
                        required
                        autoFocus
                        value={formData.metric_name}
                        onChange={(event) => onInputChange('metric_name', event.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-all focus:border-accent/50"
                        placeholder={t('kris:form.placeholders.metric_name')}
                    />
                </div>

                <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {t('common:labels.description')} *
                    </label>
                    <textarea
                        required
                        rows={3}
                        value={formData.description}
                        onChange={(event) => onInputChange('description', event.target.value)}
                        className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-all focus:border-accent/50"
                        placeholder={t('kris:form.placeholders.description')}
                    />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <div>
                        <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {t('kris:fields.current_value')} *
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            required
                            value={formData.current_value}
                            onChange={(event) =>
                                onInputChange('current_value', parseFloat(event.target.value) || 0)
                            }
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-all focus:border-accent/50"
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-emerald-500">
                            {t('kris:fields.lower_limit')}
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={formData.lower_limit}
                            onChange={(event) =>
                                onInputChange('lower_limit', parseFloat(event.target.value) || 0)
                            }
                            className="w-full rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-emerald-400 outline-none transition-all focus:border-emerald-500/50"
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-rose-500">
                            {t('kris:fields.upper_limit')}
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={formData.upper_limit}
                            onChange={(event) =>
                                onInputChange('upper_limit', parseFloat(event.target.value) || 0)
                            }
                            className="w-full rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-rose-400 outline-none transition-all focus:border-rose-500/50"
                        />
                    </div>
                </div>

                <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {t('kris:fields.unit')}
                    </label>
                    <ThemedSelect
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
                </div>

                <div className="grid gap-4 border-t border-white/5 pt-4 md:grid-cols-2">
                    <div>
                        <label className="mb-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <Calendar className="h-3 w-3" />
                            {t('kris:fields.frequency')}
                        </label>
                        <ThemedSelect
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
                    </div>
                    <div>
                        <label className="mb-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <User className="h-3 w-3" />
                            {t('kris:fields.owner')}
                        </label>
                        <ThemedSelect
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
                        <p className="ml-1 mt-1 text-[9px] text-slate-600">
                            {t('kris:form.reporting_owner_hint')}
                        </p>
                    </div>
                </div>

                <div className="border-t border-white/5 pt-4">
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
                        <p className="mt-2 text-[10px] text-slate-500">
                            {t('kris:vendor_assignment.vendor_context_auto_linked')}
                        </p>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
