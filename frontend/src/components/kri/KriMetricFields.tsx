import { useId } from 'react';

import type { KriModalFormData, KriModalTranslate } from './kriModalTypes';

interface KriMetricFieldsProps {
    clearError: () => void;
    formData: KriModalFormData;
    isCreate: boolean;
    t: KriModalTranslate;
    updateFormData: (update: KriModalFormData) => void;
}

export function KriMetricFields({
    clearError,
    formData,
    isCreate,
    t,
    updateFormData,
}: KriMetricFieldsProps) {
    const metricNameId = useId();
    const descriptionId = useId();
    const currentValueId = useId();
    const unitId = useId();
    return (
        <>
            <div className="space-y-2">
                <label htmlFor={metricNameId} className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                    {t('modal.metric_name', { ns: 'kris' })}
                </label>
                <input
                    id={metricNameId}
                    type="text"
                    placeholder={t('form.placeholders.metric_name')}
                    value={formData.metric_name}
                    onChange={(event) => {
                        updateFormData({ metric_name: event.target.value });
                        clearError();
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all font-medium"
                />
            </div>

            <div className="space-y-2">
                <label htmlFor={descriptionId} className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                    {t('fields.description', { ns: 'kris' })}
                </label>
                <textarea
                    id={descriptionId}
                    rows={3}
                    value={formData.description}
                    onChange={(event) => {
                        updateFormData({ description: event.target.value });
                        clearError();
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all resize-none"
                    placeholder={t('form.placeholders.description', { ns: 'kris' })}
                />
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label htmlFor={currentValueId} className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                        {isCreate
                            ? t('fields.current_value', { ns: 'kris' })
                            : t('modal.current_value_readonly', { ns: 'kris' })}
                    </label>
                    <input
                        id={currentValueId}
                        type="number"
                        value={formData.current_value}
                        onChange={(event) => updateFormData({ current_value: Number.parseFloat(event.target.value) })}
                        disabled={!isCreate}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor={unitId} className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                        {t('modal.unit_examples', { ns: 'kris' })}
                    </label>
                    <input
                        id={unitId}
                        type="text"
                        value={formData.unit}
                        onChange={(event) => updateFormData({ unit: event.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                    />
                </div>
            </div>
        </>
    );
}
