import type { Control } from '@/types/control';
import { ControlStatus } from '@/types/control';

interface ControlFormStatusStepProps {
    formData: Partial<Control>;
    handleInputChange: (field: keyof Control, value: unknown) => void;
    t: (key: string, options?: Record<string, unknown>) => string;
}

export function ControlFormStatusStep({ formData, handleInputChange, t }: ControlFormStatusStepProps) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('controls:form.labels.inherent_risk_level')}</label>
                <div className="flex items-center gap-4">
                    <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={formData.risk_level}
                        onChange={(event) => handleInputChange('risk_level', parseInt(event.target.value))}
                        className="flex-1 accent-accent"
                    />
                    <span className="w-12 h-12 rounded-xl bg-accent text-white flex items-center justify-center font-black text-xl shadow-lg shadow-accent/25">
                        {formData.risk_level}
                    </span>
                </div>
            </div>
            <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('controls:form.labels.initial_status')}</label>
                <div className="grid grid-cols-2 gap-4">
                    {[ControlStatus.DRAFT, ControlStatus.ACTIVE].map((status) => (
                        <button
                            key={status}
                            type="button"
                            onClick={() => handleInputChange('status', status)}
                            className={`py-3 rounded-xl border-2 font-bold uppercase tracking-widest text-[10px] transition-all ${formData.status === status ? 'bg-accent/10 border-accent text-accent' : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'
                                }`}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
