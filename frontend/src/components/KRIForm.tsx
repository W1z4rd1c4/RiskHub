import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Save,
    X,
    AlertCircle,
    Target,
    Search
} from 'lucide-react';
import { kriApi } from '@/services/kriApi';
import { riskApi } from '@/services/riskApi';
import type { KRICreate } from '@/types/kri';
import type { RiskSummary } from '@/types/risk';

interface KRIFormProps {
    initialData?: Partial<KRICreate>;
    isEdit?: boolean;
    kriId?: number;
}

export function KRIForm({ initialData, isEdit = false, kriId }: KRIFormProps) {
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Step state
    const [currentStep, setCurrentStep] = useState(0);

    // Risk lookup
    const [risks, setRisks] = useState<RiskSummary[]>([]);
    const [riskSearch, setRiskSearch] = useState('');
    const [isLoadingRisks, setIsLoadingRisks] = useState(true);

    const [formData, setFormData] = useState<Partial<KRICreate>>({
        risk_id: undefined,
        metric_name: '',
        current_value: 0,
        lower_limit: 0,
        upper_limit: 100,
        unit: '%',
        ...initialData
    });

    useEffect(() => {
        const loadRisks = async () => {
            try {
                setIsLoadingRisks(true);
                setError(null);
                const response = await riskApi.getRisks({ skip: 0, limit: 100 });
                if (response?.items) {
                    setRisks(response.items);
                }
            } catch (err: any) {
                console.error('Error loading risks:', err);
                setError('Failed to load risks.');
            } finally {
                setIsLoadingRisks(false);
            }
        };
        loadRisks();
    }, []);

    const handleInputChange = (field: keyof KRICreate, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setError(null); // Clear error on change
    };

    const validateStep1 = () => {
        if (!formData.risk_id) {
            setError('Please select a risk to proceed.');
            return false;
        }
        return true;
    };

    const validateStep2 = () => {
        if (!formData.metric_name?.trim()) {
            setError('Please enter a metric name.');
            return false;
        }
        return true;
    };

    const nextStep = () => {
        if (currentStep === 0 && !validateStep1()) return;
        setError(null);
        setCurrentStep(1);
    };

    const prevStep = () => {
        setError(null);
        setCurrentStep(0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateStep1() || !validateStep2()) return;

        try {
            setIsSubmitting(true);
            setError(null);

            if (isEdit && kriId) {
                await kriApi.updateKRI(kriId, formData);
            } else {
                await kriApi.createKRI(formData as KRICreate);
            }

            navigate('/kris');
        } catch (err: any) {
            console.error('Error saving KRI:', err);
            setError(err.message || 'Failed to save KRI.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Filter states
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedProcess, setSelectedProcess] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');

    const [uniqueDepartments, setUniqueDepartments] = useState<string[]>([]);
    const [uniqueProcesses, setUniqueProcesses] = useState<string[]>([]);
    const [uniqueCategories, setUniqueCategories] = useState<string[]>([]);

    useEffect(() => {
        if (risks.length > 0) {
            const depts = [...new Set(risks.map(r => r.department_name).filter(Boolean))].sort() as string[];
            const procs = [...new Set(risks.map(r => r.process).filter(Boolean))].sort() as string[];
            const cats = [...new Set(risks.map(r => r.category).filter(Boolean))].sort() as string[];

            setUniqueDepartments(depts);
            setUniqueProcesses(procs);
            setUniqueCategories(cats);
        }
    }, [risks]);

    // Filter risks based on search AND dropdowns
    const filteredRisks = risks.filter(risk => {
        const matchesSearch = !riskSearch ||
            risk.risk_id_code?.toLowerCase().includes(riskSearch.toLowerCase()) ||
            risk.process.toLowerCase().includes(riskSearch.toLowerCase()) ||
            risk.category?.toLowerCase().includes(riskSearch.toLowerCase()) ||
            risk.department_name?.toLowerCase().includes(riskSearch.toLowerCase());

        const matchesDept = !selectedDept || risk.department_name === selectedDept;
        const matchesProcess = !selectedProcess || risk.process === selectedProcess;
        const matchesCategory = !selectedCategory || risk.category === selectedCategory;

        return matchesSearch && matchesDept && matchesProcess && matchesCategory;
    });

    const selectedRisk = risks.find(r => r.id === formData.risk_id);

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl mx-auto">
            <div className="glass-card min-h-[500px] flex flex-col">

                {error && (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="h-5 w-5" />
                        {error}
                    </div>
                )}

                <div className="flex-1 space-y-8">

                    {/* STEP 1: Link to Risk */}
                    {currentStep === 0 && (
                        <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h3 className="text-[10px] font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Target className="h-4 w-4 text-accent" />
                                Link to Risk
                            </h3>

                            {selectedRisk ? (
                                <div className="p-4 bg-accent/10 border border-accent/30 rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-bold text-white">{selectedRisk.process}</p>
                                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{selectedRisk.category || 'Uncategorized'}</p>
                                            <p className="text-xs text-slate-300 mt-2 italic">{selectedRisk.description}</p>
                                            {selectedRisk.department_name && (
                                                <span className="inline-block mt-3 px-2 py-0.5 rounded bg-white/10 text-[10px] uppercase font-bold text-slate-300">
                                                    {selectedRisk.department_name}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleInputChange('risk_id', undefined)}
                                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                        >
                                            <X className="h-4 w-4 text-slate-400" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Filters Row */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <select
                                            value={selectedDept}
                                            onChange={(e) => setSelectedDept(e.target.value)}
                                            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-accent/50 transition-all appearance-none"
                                        >
                                            <option value="" className="bg-slate-900">All Departments</option>
                                            {uniqueDepartments.map(d => (
                                                <option key={d} value={d} className="bg-slate-900">{d}</option>
                                            ))}
                                        </select>

                                        <select
                                            value={selectedProcess}
                                            onChange={(e) => setSelectedProcess(e.target.value)}
                                            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-accent/50 transition-all appearance-none"
                                        >
                                            <option value="" className="bg-slate-900">All Processes</option>
                                            {uniqueProcesses.map(p => (
                                                <option key={p} value={p} className="bg-slate-900">{p}</option>
                                            ))}
                                        </select>

                                        <select
                                            value={selectedCategory}
                                            onChange={(e) => setSelectedCategory(e.target.value)}
                                            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-accent/50 transition-all appearance-none"
                                        >
                                            <option value="" className="bg-slate-900">All Categories</option>
                                            {uniqueCategories.map(c => (
                                                <option key={c} value={c} className="bg-slate-900">{c}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                                        <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                                        <input
                                            type="text"
                                            placeholder="Search by risk ID, name..."
                                            value={riskSearch}
                                            onChange={(e) => setRiskSearch(e.target.value)}
                                            className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                                        />
                                    </div>

                                    <div className="max-h-[400px] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5 custom-scrollbar">
                                        {isLoadingRisks ? (
                                            <div className="p-8 text-center text-slate-500 text-sm">
                                                <div className="animate-spin h-5 w-5 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2"></div>
                                                Loading risks...
                                            </div>
                                        ) : risks.length === 0 ? (
                                            <div className="p-8 text-center text-slate-500 text-sm">
                                                No risks available. Go to Risks → New Risk to create one first.
                                            </div>
                                        ) : filteredRisks.length === 0 ? (
                                            <div className="p-8 text-center text-slate-500 text-sm">
                                                No risks match your search. Try a different term.
                                            </div>
                                        ) : (
                                            filteredRisks.slice(0, 20).map(risk => (
                                                <button
                                                    key={risk.id}
                                                    type="button"
                                                    onClick={() => handleInputChange('risk_id', risk.id)}
                                                    className="w-full text-left hover:brightness-125 transition-all flex items-stretch gap-2 group p-2"
                                                >
                                                    {/* Left Bubble */}
                                                    <div className="bg-white/5 rounded-lg p-3 w-[200px] shrink-0 flex flex-col justify-center group-hover:bg-white/10 transition-colors">
                                                        <p className="text-sm font-bold text-white truncate" title={risk.process}>{risk.process}</p>
                                                        <p className="text-[10px] text-slate-500 mt-1 truncate" title={risk.category}>{risk.category || 'Uncategorized'}</p>
                                                    </div>

                                                    {/* Right Bubble */}
                                                    <div className="bg-white/5 rounded-lg p-3 flex-1 flex items-center group-hover:bg-white/10 transition-colors">
                                                        {risk.description ? (
                                                            <p className="text-[10px] text-slate-400 break-words leading-tight">
                                                                {risk.description.length > 120
                                                                    ? `${risk.description.slice(0, 120)}...`
                                                                    : risk.description}
                                                            </p>
                                                        ) : (
                                                            <span className="text-[10px] text-slate-600 italic">No description available</span>
                                                        )}
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {/* STEP 2: KRI Details */}
                    {currentStep === 1 && (
                        <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h3 className="text-[10px] font-black text-white uppercase tracking-widest mb-4">KRI Details</h3>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                        Metric Name *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        autoFocus
                                        value={formData.metric_name}
                                        onChange={(e) => handleInputChange('metric_name', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                        placeholder="e.g. Customer complaint rate"
                                    />
                                </div>

                                <div className="grid md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                            Current Value *
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            required
                                            value={formData.current_value}
                                            onChange={(e) => handleInputChange('current_value', parseFloat(e.target.value) || 0)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">
                                            Lower Limit
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.lower_limit}
                                            onChange={(e) => handleInputChange('lower_limit', parseFloat(e.target.value) || 0)}
                                            className="w-full bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-400 outline-none focus:border-emerald-500/50 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-rose-500 uppercase tracking-widest mb-2">
                                            Upper Limit
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.upper_limit}
                                            onChange={(e) => handleInputChange('upper_limit', parseFloat(e.target.value) || 0)}
                                            className="w-full bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 outline-none focus:border-rose-500/50 transition-all"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                        Unit
                                    </label>
                                    <select
                                        value={formData.unit}
                                        onChange={(e) => handleInputChange('unit', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all appearance-none"
                                    >
                                        <option value="%" className="bg-slate-900">% (Percentage)</option>
                                        <option value="count" className="bg-slate-900">Count</option>
                                        <option value="days" className="bg-slate-900">Days</option>
                                        <option value="hours" className="bg-slate-900">Hours</option>
                                        <option value="CZK" className="bg-slate-900">CZK</option>
                                        <option value="EUR" className="bg-slate-900">EUR</option>
                                        <option value="ratio" className="bg-slate-900">Ratio</option>
                                    </select>
                                </div>
                            </div>
                        </section>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="mt-8 pt-8 border-t border-white/5 flex justify-between items-center">
                    {currentStep === 0 ? (
                        <>
                            <button
                                type="button"
                                onClick={() => navigate('/kris')}
                                className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
                            >
                                <X className="h-4 w-4" />
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={nextStep}
                                className="btn-primary"
                            >
                                Next Step
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={prevStep}
                                className="text-slate-400 hover:text-white transition-colors font-bold text-sm"
                            >
                                Back
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="btn-primary px-8"
                            >
                                {isSubmitting ? 'Saving...' : (isEdit ? 'Update KRI' : 'Create KRI')}
                                <Save className="h-4 w-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </form>
    );
}
