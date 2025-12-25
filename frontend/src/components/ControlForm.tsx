import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Save,
    X,
    ChevronRight,
    ChevronLeft,
    CheckCircle2,
    AlertCircle,
    Info,
    User,
    Settings,
    ShieldCheck
} from 'lucide-react';
import { controlApi } from '@/services/controlApi';
import type { Control, ControlCreate, ControlUpdate } from '@/types/control';
import { ControlForm as ControlFormType, ControlFrequency, ControlStatus } from '@/types/control';
import { useAuth } from '@/contexts/AuthContext';

interface ControlFormProps {
    initialData?: Control;
    isEdit?: boolean;
}

const steps = [
    { id: 'identity', title: 'Identity', icon: Info },
    { id: 'ownership', title: 'Ownership', icon: User },
    { id: 'execution', title: 'Execution', icon: Settings },
    { id: 'risk', title: 'Risk & Status', icon: ShieldCheck },
];

export function ControlForm({ initialData, isEdit = false }: ControlFormProps) {
    const navigate = useNavigate();
    const { mockUserId } = useAuth();
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState<Partial<Control>>({
        name: '',
        description: '',
        status: ControlStatus.DRAFT,
        control_form: ControlFormType.MANUAL,
        frequency: ControlFrequency.MONTHLY,
        risk_level: 3,
        ...initialData
    });

    const handleInputChange = (field: keyof Control, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            setError(null);

            if (isEdit && initialData) {
                await controlApi.updateControl(initialData.id, formData as ControlUpdate, mockUserId);
            } else {
                await controlApi.createControl(formData as ControlCreate, mockUserId);
            }

            navigate('/controls');
        } catch (err: any) {
            console.error('Error saving control:', err);
            setError(err.message || 'Failed to save control. Please check your input.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto">
            {/* Multi-step indicator */}
            <div className="flex justify-between items-center px-4">
                {steps.map((step, idx) => (
                    <div key={step.id} className="flex flex-col items-center gap-2 group cursor-pointer" onClick={() => setCurrentStep(idx)}>
                        <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${currentStep === idx ? 'bg-accent border-accent text-white shadow-[0_0_15px_rgba(30,132,255,0.3)]' :
                            currentStep > idx ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-500'
                            }`}>
                            {currentStep > idx ? <CheckCircle2 className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${currentStep === idx ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
                            {step.title}
                        </span>
                    </div>
                ))}
            </div>

            <div className="glass-card min-h-[400px] flex flex-col">
                {error && (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-medium">
                        <AlertCircle className="h-5 w-5" />
                        {error}
                    </div>
                )}

                <div className="flex-1 space-y-6">
                    {currentStep === 0 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Control Name</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-700"
                                    placeholder="e.g. Daily Transaction Reconciliation"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Description</label>
                                <textarea
                                    required
                                    rows={4}
                                    value={formData.description}
                                    onChange={(e) => handleInputChange('description', e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-700 resize-none"
                                    placeholder="Describe the purpose and steps of this control..."
                                />
                            </div>
                        </div>
                    )}

                    {currentStep === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Control Owner ID</label>
                                    <input
                                        type="number"
                                        value={formData.control_owner_id || ''}
                                        onChange={(e) => handleInputChange('control_owner_id', parseInt(e.target.value))}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Owner Position</label>
                                    <input
                                        type="text"
                                        value={formData.process_owner_position || ''}
                                        onChange={(e) => handleInputChange('process_owner_position', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                        placeholder="e.g. Chief Accountant"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Department ID</label>
                                <input
                                    type="number"
                                    value={formData.department_id || ''}
                                    onChange={(e) => handleInputChange('department_id', parseInt(e.target.value))}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                />
                            </div>
                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Frequency</label>
                                    <select
                                        value={formData.frequency}
                                        onChange={(e) => handleInputChange('frequency', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all appearance-none"
                                    >
                                        {Object.values(ControlFrequency).map(f => (
                                            <option key={f} value={f} className="bg-slate-900">{f.replace('_', ' ').toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Control Form</label>
                                    <select
                                        value={formData.control_form}
                                        onChange={(e) => handleInputChange('control_form', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all appearance-none"
                                    >
                                        {Object.values(ControlFormType).map(f => (
                                            <option key={f} value={f} className="bg-slate-900">{f.toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Data Source & Methodology</label>
                                <div className="space-y-4">
                                    <input
                                        type="text"
                                        value={formData.data_source || ''}
                                        onChange={(e) => handleInputChange('data_source', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                        placeholder="Data Source (e.g. SAP Export)"
                                    />
                                    <input
                                        type="text"
                                        value={formData.methodology_reference || ''}
                                        onChange={(e) => handleInputChange('methodology_reference', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                        placeholder="Methodology Reference (e.g. Standard OS 18)"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Inherent Risk Level (1-5)</label>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="1"
                                        max="5"
                                        step="1"
                                        value={formData.risk_level}
                                        onChange={(e) => handleInputChange('risk_level', parseInt(e.target.value))}
                                        className="flex-1 accent-accent"
                                    />
                                    <span className="w-12 h-12 rounded-xl bg-accent text-white flex items-center justify-center font-black text-xl shadow-[0_0_15px_rgba(30,132,255,0.2)]">
                                        {formData.risk_level}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Initial Status</label>
                                <div className="grid grid-cols-2 gap-4">
                                    {[ControlStatus.DRAFT, ControlStatus.ACTIVE].map(s => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => handleInputChange('status', s)}
                                            className={`py-3 rounded-xl border-2 font-bold uppercase tracking-widest text-[10px] transition-all ${formData.status === s ? 'bg-accent/10 border-accent text-accent' : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'
                                                }`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="mt-12 flex justify-between items-center pt-8 border-t border-white/5">
                    <button
                        type="button"
                        onClick={() => currentStep === 0 ? navigate('/controls') : prevStep()}
                        className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
                    >
                        {currentStep === 0 ? <X className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                        {currentStep === 0 ? 'Cancel' : 'Back'}
                    </button>

                    {currentStep < steps.length - 1 ? (
                        <button
                            type="button"
                            onClick={nextStep}
                            className="btn-primary"
                        >
                            Next Step <ChevronRight className="h-4 w-4" />
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="btn-primary"
                        >
                            {isSubmitting ? 'Saving...' : (isEdit ? 'Update Control' : 'Create Control')}
                            <Save className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
        </form>
    );
}
