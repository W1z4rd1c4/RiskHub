import type { KriModalFormData, KriModalTranslate } from './kriModalTypes';

interface KriThresholdFieldsProps {
    formData: KriModalFormData;
    t: KriModalTranslate;
    updateFormData: (update: KriModalFormData) => void;
}

export function KriThresholdFields({ formData, t, updateFormData }: KriThresholdFieldsProps) {
    return (
        <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/5">
            <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-rose-500/50 ml-1">
                    {t('modal.lower_limit_breach', { ns: 'kris' })}
                </label>
                <input
                    type="number"
                    value={formData.lower_limit}
                    onChange={(event) => updateFormData({ lower_limit: Number.parseFloat(event.target.value) })}
                    className="w-full bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3 text-white outline-none focus:border-rose-500/50 transition-all font-mono"
                />
            </div>
            <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-rose-500/50 ml-1">
                    {t('modal.upper_limit_breach', { ns: 'kris' })}
                </label>
                <input
                    type="number"
                    value={formData.upper_limit}
                    onChange={(event) => updateFormData({ upper_limit: Number.parseFloat(event.target.value) })}
                    className="w-full bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3 text-white outline-none focus:border-rose-500/50 transition-all font-mono"
                />
            </div>
        </div>
    );
}
