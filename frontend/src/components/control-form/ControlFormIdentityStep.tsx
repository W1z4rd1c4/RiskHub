import type { Control } from '@/types/control';

interface ControlFormIdentityStepProps {
    formData: Partial<Control>;
    handleInputChange: (field: keyof Control, value: unknown) => void;
    t: (key: string, options?: Record<string, unknown>) => string;
}

export function ControlFormIdentityStep({ formData, handleInputChange, t }: ControlFormIdentityStepProps) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('controls:fields.name')}</label>
                <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(event) => handleInputChange('name', event.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-400"
                    placeholder={t('form.placeholders.name')}
                />
            </div>
            <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('common:labels.description')}</label>
                <textarea
                    required
                    rows={4}
                    value={formData.description}
                    onChange={(event) => handleInputChange('description', event.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-400 resize-none"
                    placeholder={t('form.placeholders.description')}
                />
            </div>
        </div>
    );
}
