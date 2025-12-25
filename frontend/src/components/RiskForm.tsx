import { useState, useEffect } from 'react';
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
    Star,
    Zap,
    Activity
} from 'lucide-react';
import { riskApi } from '@/services/riskApi';
import { lookupApi } from '@/services/lookupApi';
import type { Risk, RiskCreate, RiskUpdate } from '@/types/risk';
import { RiskType, RiskStatus } from '@/types/risk';
import { useAuth } from '@/contexts/AuthContext';
import { RiskScoreMatrix } from '@/components/RiskScoreMatrix';

interface RiskFormProps {
    initialData?: Risk;
    isEdit?: boolean;
}

const steps = [
    { id: 'identity', title: 'Identity', icon: Info },
    { id: 'ownership', title: 'Details & Owner', icon: User },
    { id: 'scoring', title: 'Risk Assessment', icon: Activity },
    { id: 'kri', title: 'KRI & Status', icon: Zap },
];

export function RiskForm({ initialData, isEdit = false }: RiskFormProps) {
    const navigate = useNavigate();
    const { mockUserId } = useAuth();
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Lookups
    const [users, setUsers] = useState<any[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);

    const [formData, setFormData] = useState<Partial<Risk>>({
        risk_id_code: '',
        process: '',
        subprocess: '',
        risk_type: RiskType.OPERATIONAL,
        category: '',
        description: '',
        status: RiskStatus.ACTIVE,
        is_priority: false,
        gross_probability: 3,
        gross_impact: 3,
        net_probability: 2,
        net_impact: 2,
        kri_indicator: '',
        kri_threshold_green: '',
        kri_threshold_yellow: '',
        kri_threshold_red: '',
        ...initialData
    });

    useEffect(() => {
        const loadLookups = async () => {
            try {
                const [userData, deptData] = await Promise.all([
                    lookupApi.getUsers(mockUserId),
                    lookupApi.getDepartments()
                ]);
                setUsers(userData);
                setDepartments(deptData);
            } catch (err) {
                console.error('Failed to load lookups:', err);
            }
        };
        loadLookups();
    }, [mockUserId]);

    const handleInputChange = (field: keyof Risk, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            setError(null);

            if (isEdit && initialData) {
                await riskApi.updateRisk(initialData.id, formData as RiskUpdate, mockUserId);
            } else {
                await riskApi.createRisk(formData as RiskCreate, mockUserId);
            }

            navigate('/risks');
        } catch (err: any) {
            console.error('Error saving risk:', err);
            setError(err.message || 'Failed to save risk. Please check your input.');
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

            <div className="glass-card min-h-[480px] flex flex-col">
                {error && (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-medium">
                        <AlertCircle className="h-5 w-5" />
                        {error}
                    </div>
                )}

                <div className="flex-1 space-y-6">
                    {/* Step 1: Identity */}
                    {currentStep === 0 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Risk ID Code</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.risk_id_code}
                                        onChange={(e) => handleInputChange('risk_id_code', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                        placeholder="e.g. MKT-R01"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Risk Type</label>
                                    <select
                                        value={formData.risk_type}
                                        onChange={(e) => handleInputChange('risk_type', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all appearance-none"
                                    >
                                        <option value={RiskType.OPERATIONAL} className="bg-slate-900">Operational</option>
                                        <option value={RiskType.STRATEGIC} className="bg-slate-900">Strategic</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Main Process</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.process}
                                        onChange={(e) => handleInputChange('process', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                        placeholder="e.g. Marketing"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Subprocess (Optional)</label>
                                    <input
                                        type="text"
                                        value={formData.subprocess || ''}
                                        onChange={(e) => handleInputChange('subprocess', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Category (Optional)</label>
                                <input
                                    type="text"
                                    value={formData.category || ''}
                                    onChange={(e) => handleInputChange('category', e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                    placeholder="e.g. Compliance Risk"
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 2: Details & Ownership */}
                    {currentStep === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Risk Description</label>
                                <textarea
                                    required
                                    rows={4}
                                    value={formData.description}
                                    onChange={(e) => handleInputChange('description', e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all resize-none"
                                />
                            </div>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Department</label>
                                    <select
                                        value={formData.department_id || ''}
                                        onChange={(e) => handleInputChange('department_id', e.target.value ? parseInt(e.target.value) : null)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all appearance-none"
                                    >
                                        <option value="" className="bg-slate-900">Select Department</option>
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id} className="bg-slate-900">{d.name} ({d.code})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Risk Owner</label>
                                    <select
                                        value={formData.owner_id || ''}
                                        onChange={(e) => handleInputChange('owner_id', e.target.value ? parseInt(e.target.value) : null)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all appearance-none"
                                    >
                                        <option value="" className="bg-slate-900">Select Owner</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id} className="bg-slate-900">{u.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className={`relative w-12 h-6 rounded-full transition-all ${formData.is_priority ? 'bg-accent' : 'bg-white/10'}`}>
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={formData.is_priority}
                                            onChange={(e) => handleInputChange('is_priority', e.target.checked)}
                                        />
                                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.is_priority ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Star className={`h-4 w-4 ${formData.is_priority ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-300 transition-colors">Priority Risk</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Scoring */}
                    {currentStep === 2 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="grid md:grid-cols-2 gap-12">
                                <section className="space-y-6">
                                    <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Gross Risk (Baseline)</h4>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-2">
                                                <span>Probability</span>
                                                <span className="text-white">{formData.gross_probability} / 5</span>
                                            </label>
                                            <input
                                                type="range" min="1" max="5" step="1"
                                                value={formData.gross_probability}
                                                onChange={(e) => handleInputChange('gross_probability', parseInt(e.target.value))}
                                                className="w-full accent-amber-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-2">
                                                <span>Impact</span>
                                                <span className="text-white">{formData.gross_impact} / 5</span>
                                            </label>
                                            <input
                                                type="range" min="1" max="5" step="1"
                                                value={formData.gross_impact}
                                                onChange={(e) => handleInputChange('gross_impact', parseInt(e.target.value))}
                                                className="w-full accent-amber-500"
                                            />
                                        </div>
                                    </div>

                                    <RiskScoreMatrix
                                        probability={formData.gross_probability || 1}
                                        impact={formData.gross_impact || 1}
                                        type="gross"
                                        size="small"
                                    />
                                </section>

                                <section className="space-y-6">
                                    <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Net Risk (Target)</h4>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-2">
                                                <span>Probability</span>
                                                <span className="text-white">{formData.net_probability} / 5</span>
                                            </label>
                                            <input
                                                type="range" min="1" max="5" step="1"
                                                value={formData.net_probability}
                                                onChange={(e) => handleInputChange('net_probability', parseInt(e.target.value))}
                                                className="w-full accent-emerald-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-2">
                                                <span>Impact</span>
                                                <span className="text-white">{formData.net_impact} / 5</span>
                                            </label>
                                            <input
                                                type="range" min="1" max="5" step="1"
                                                value={formData.net_impact}
                                                onChange={(e) => handleInputChange('net_impact', parseInt(e.target.value))}
                                                className="w-full accent-emerald-500"
                                            />
                                        </div>
                                    </div>

                                    <RiskScoreMatrix
                                        probability={formData.net_probability || 1}
                                        impact={formData.net_impact || 1}
                                        type="net"
                                        size="small"
                                    />
                                </section>
                            </div>
                        </div>
                    )}

                    {/* Step 4: KRI & Status */}
                    {currentStep === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Current Status</label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {Object.values(RiskStatus).map(s => (
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

                            <div className="pt-6 border-t border-white/5">
                                <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-4">Key Risk Indicator (KRI)</h4>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">KRI Definition</label>
                                        <input
                                            type="text"
                                            value={formData.kri_indicator || ''}
                                            onChange={(e) => handleInputChange('kri_indicator', e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                            placeholder="e.g. Number of security incidents per month"
                                        />
                                    </div>
                                    <div className="grid md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Green Threshold</label>
                                            <input
                                                type="text"
                                                value={formData.kri_threshold_green || ''}
                                                onChange={(e) => handleInputChange('kri_threshold_green', e.target.value)}
                                                className="w-full bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-400 text-xs outline-none focus:border-emerald-500/50"
                                                placeholder="e.g. < 2"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2">Yellow Threshold</label>
                                            <input
                                                type="text"
                                                value={formData.kri_threshold_yellow || ''}
                                                onChange={(e) => handleInputChange('kri_threshold_yellow', e.target.value)}
                                                className="w-full bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 text-amber-400 text-xs outline-none focus:border-amber-500/50"
                                                placeholder="e.g. 2 - 5"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-rose-500 uppercase tracking-widest mb-2">Red Threshold</label>
                                            <input
                                                type="text"
                                                value={formData.kri_threshold_red || ''}
                                                onChange={(e) => handleInputChange('kri_threshold_red', e.target.value)}
                                                className="w-full bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-xs outline-none focus:border-rose-500/50"
                                                placeholder="e.g. > 5"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="mt-12 flex justify-between items-center pt-8 border-t border-white/5">
                    <button
                        type="button"
                        onClick={() => currentStep === 0 ? navigate('/risks') : prevStep()}
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
                            className="btn-primary px-8"
                        >
                            {isSubmitting ? 'Saving...' : (isEdit ? 'Update Risk' : 'Create Risk')}
                            <Save className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
        </form>
    );
}
