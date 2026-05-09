import type { Control } from '@/types/control';
import { ControlForm as ControlFormType, ControlFrequency } from '@/types/control';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

const formatFrequencyLabel = (value: string): string =>
    value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

interface ControlFormExecutionStepProps {
    formData: Partial<Control>;
    handleInputChange: (field: keyof Control, value: unknown) => void;
    t: (key: string, options?: Record<string, unknown>) => string;
}

export function ControlFormExecutionStep({ formData, handleInputChange, t }: ControlFormExecutionStepProps) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('common:labels.frequency')}</label>
                    <ThemedSelect
                        value={formData.frequency || ControlFrequency.MONTHLY}
                        onValueChange={(value) => handleInputChange('frequency', value)}
                        className="w-full"
                        options={Object.values(ControlFrequency).map((frequency) => ({ value: frequency, label: formatFrequencyLabel(frequency) }))}
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('common:labels.form')}</label>
                    <ThemedSelect
                        value={formData.control_form || ControlFormType.MANUAL}
                        onValueChange={(value) => handleInputChange('control_form', value)}
                        className="w-full"
                        options={Object.values(ControlFormType).map((form) => ({ value: form, label: form.toUpperCase() }))}
                    />
                </div>
            </div>
            <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('controls:form.labels.data_source_methodology')}</label>
                <div className="space-y-4">
                    <input
                        type="text"
                        value={formData.data_source || ''}
                        onChange={(event) => handleInputChange('data_source', event.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                        placeholder={t('form.placeholders.data_source')}
                    />
                    <input
                        type="text"
                        value={formData.methodology_reference || ''}
                        onChange={(event) => handleInputChange('methodology_reference', event.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                        placeholder={t('form.placeholders.methodology_reference')}
                    />
                </div>
            </div>
        </div>
    );
}
