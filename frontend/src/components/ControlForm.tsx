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
    Settings,
    ShieldCheck,
    Link as LinkIcon,
    Target,
    Search
} from 'lucide-react';
import { controlApi } from '@/services/controlApi';
import { lookupApi } from '@/services/lookupApi';
import { riskApi } from '@/services/riskApi';
import type { Control, ControlCreate, ControlUpdate } from '@/types/control';
import { ControlForm as ControlFormType, ControlFrequency, ControlStatus } from '@/types/control';
import type { RiskSummary, ControlEffectiveness } from '@/types/risk';
interface ControlFormProps {
    initialData?: Control;
    isEdit?: boolean;
}

const steps = [
    { id: 'identity', title: 'Identity', icon: Info },
    { id: 'ownership', title: 'Ownership', icon: User },
    { id: 'execution', title: 'Execution', icon: Settings },
    { id: 'risk', title: 'Risk & Status', icon: ShieldCheck },
    { id: 'link_risk', title: 'Link Risk', icon: LinkIcon }
];

interface UserOption {
    id: number;
    name: string;
    email: string;
}

interface DepartmentOption {
    id: number;
    name: string;
    code: string;
}

export function ControlForm({ initialData, isEdit = false }: ControlFormProps) {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Lookup data
    const [users, setUsers] = useState<UserOption[]>([]);
    const [departments, setDepartments] = useState<DepartmentOption[]>([]);
    const [isLoadingLookups, setIsLoadingLookups] = useState(true);

    // Risk Linking State
    const [risks, setRisks] = useState<RiskSummary[]>([]);
    const [riskSearch, setRiskSearch] = useState('');
    const [isLoadingRisks, setIsLoadingRisks] = useState(false);

    // Risk Selection State
    const [selectedRiskId, setSelectedRiskId] = useState<number | undefined>(undefined);
    const [riskEffectiveness, setRiskEffectiveness] = useState<ControlEffectiveness>('high' as ControlEffectiveness);
    const [linkNotes, setLinkNotes] = useState('');

    // Risk Filters
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedProcess, setSelectedProcess] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [uniqueDepartments, setUniqueDepartments] = useState<string[]>([]);
    const [uniqueProcesses, setUniqueProcesses] = useState<string[]>([]);
    const [uniqueCategories, setUniqueCategories] = useState<string[]>([]);

    const [formData, setFormData] = useState<Partial<Control>>({
        name: '',
        description: '',
        status: ControlStatus.DRAFT,
        control_form: ControlFormType.MANUAL,
        frequency: ControlFrequency.MONTHLY,
        risk_level: 3,
        ...initialData
    });

    // Fetch lookup data and risks on mount
    useEffect(() => {
        const fetchLookups = async () => {
            try {
                setIsLoadingLookups(true);
                const [usersData, deptData] = await Promise.all([
                    lookupApi.getUsers(),
                    lookupApi.getDepartments()
                ]);
                setUsers(usersData);
                setDepartments(deptData);
            } catch (err) {
                console.error('Failed to load lookup data:', err);
            } finally {
                setIsLoadingLookups(false);
            }
        };

        const fetchRisks = async () => {
            try {
                setIsLoadingRisks(true);
                const response = await riskApi.getRisks({ limit: 100 });
                if (response?.items) {
                    setRisks(response.items);
                }
            } catch (err) {
                console.error('Failed to load risks:', err);
            } finally {
                setIsLoadingRisks(false);
            }
        }

        fetchLookups();
        fetchRisks();
    }, []);

    // Extract unique filter options when risks load
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


    const handleInputChange = (field: keyof Control, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setError(null); // Clear error on change
    };

    const validateStep0 = () => {
        if (!formData.name?.trim()) {
            setError('Control Name is required.');
            return false;
        }
        if (!formData.description?.trim()) {
            setError('Description is required.');
            return false;
        }
        return true;
    };

    const validateStep1 = () => {
        if (!formData.control_owner_id) {
            setError('Control Owner is required.');
            return false;
        }
        if (!formData.process_owner_position?.trim()) {
            setError('Owner Position is required.');
            return false;
        }
        if (!formData.department_id) {
            setError('Department is required.');
            return false;
        }
        return true;
    };

    const validateStep2 = () => {
        if (!formData.data_source?.trim()) {
            setError('Data Source is required.');
            return false;
        }
        if (!formData.methodology_reference?.trim()) {
            setError('Methodology Reference is required.');
            return false;
        }
        return true;
    };

    // Step 3 (Risk & Status) has defaults so it's always valid
    // Step 4 (Risk Link) is optional

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

    const selectedRisk = risks.find(r => r.id === selectedRiskId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Final validation before submit
        if (!validateStep0() || !validateStep1() || !validateStep2()) {
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);

            let controlId = initialData?.id;

            if (isEdit && initialData) {
                await controlApi.updateControl(initialData.id, formData as ControlUpdate);
            } else {
                const newControl = await controlApi.createControl(formData as ControlCreate);
                controlId = newControl.id;
            }

            // If a risk is selected, link it
            if (controlId && selectedRiskId) {
                try {
                    await controlApi.linkRisk(controlId, {
                        risk_id: selectedRiskId,
                        effectiveness: riskEffectiveness,
                        notes: linkNotes
                    });
                } catch (linkErr) {
                    console.error('Control created but failed to link risk:', linkErr);
                    // We don't block navigation, but maybe we should warn? 
                    // For now, let's proceed.
                }
            }

            navigate('/controls');
        } catch (err: any) {
            console.error('Error saving control:', err);
            setError(err.message || 'Failed to save control. Please check your input.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const nextStep = () => {
        setError(null);
        if (currentStep === 0 && !validateStep0()) return;
        if (currentStep === 1 && !validateStep1()) return;
        if (currentStep === 2 && !validateStep2()) return;

        setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    };

    const prevStep = () => {
        setError(null);
        setCurrentStep(prev => Math.max(prev - 1, 0));
    };

    const handleStepClick = (index: number) => {
        // Allow going back
        if (index < currentStep) {
            setError(null);
            setCurrentStep(index);
            return;
        }

        // If clicking next step immediately, validate current
        if (index === currentStep + 1) {
            nextStep();
            return;
        }

        // Prevent jumping multiple steps or if current invalid
        // logic: if index > currentStep + 1, we ignore
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto">
            {/* Multi-step indicator */}
            <div className="flex justify-between items-center px-4">
                {steps.map((step, idx) => {
                    // Determine if step is clickable (previous or immediate next)
                    const isClickable = idx <= currentStep + 1;

                    return (
                        <div
                            key={step.id}
                            className={`flex flex-col items-center gap-2 group transition-all ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                            onClick={() => isClickable && handleStepClick(idx)}
                        >
                            <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${currentStep === idx ? 'bg-accent border-accent text-white shadow-[0_0_15px_rgba(30,132,255,0.3)]' :
                                currentStep > idx ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-500'
                                }`}>
                                {currentStep > idx ? <CheckCircle2 className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
                            </div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${currentStep === idx ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
                                {step.title}
                            </span>
                        </div>
                    );
                })}
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
                            {isLoadingLookups ? (
                                <div className="text-slate-500 text-sm">Loading...</div>
                            ) : (
                                <>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Control Owner</label>
                                            <select
                                                value={formData.control_owner_id || ''}
                                                onChange={(e) => handleInputChange('control_owner_id', e.target.value ? parseInt(e.target.value) : undefined)}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all appearance-none"
                                            >
                                                <option value="" className="bg-slate-900">-- Select Owner --</option>
                                                {users.map(user => (
                                                    <option key={user.id} value={user.id} className="bg-slate-900">
                                                        {user.name} ({user.email})
                                                    </option>
                                                ))}
                                            </select>
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
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Department</label>
                                        <select
                                            value={formData.department_id || ''}
                                            onChange={(e) => handleInputChange('department_id', e.target.value ? parseInt(e.target.value) : undefined)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all appearance-none"
                                        >
                                            <option value="" className="bg-slate-900">-- Select Department --</option>
                                            {departments.map(dept => (
                                                <option key={dept.id} value={dept.id} className="bg-slate-900">
                                                    {dept.name} ({dept.code})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
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

                    {currentStep === 4 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div>
                                <h3 className="text-[10px] font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Target className="h-4 w-4 text-accent" />
                                    Link to Risk (Optional)
                                </h3>

                                {selectedRisk ? (
                                    <div className="space-y-6">
                                        {/* Selected Risk Display */}
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
                                                    onClick={() => setSelectedRiskId(undefined)}
                                                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                                >
                                                    <X className="h-4 w-4 text-slate-400" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Link Details */}
                                        <div className="grid md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Effectiveness</label>
                                                <select
                                                    value={riskEffectiveness}
                                                    onChange={(e) => setRiskEffectiveness(e.target.value as ControlEffectiveness)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all appearance-none"
                                                >
                                                    <option value="high" className="bg-slate-900">High</option>
                                                    <option value="medium" className="bg-slate-900">Medium</option>
                                                    <option value="low" className="bg-slate-900">Low</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Link Notes (Optional)</label>
                                                <input
                                                    type="text"
                                                    value={linkNotes}
                                                    onChange={(e) => setLinkNotes(e.target.value)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                                    placeholder="Rationale for this link..."
                                                />
                                            </div>
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

                                        <div className="max-h-[200px] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5 custom-scrollbar">
                                            {isLoadingRisks ? (
                                                <div className="p-8 text-center text-slate-500 text-sm">
                                                    <div className="animate-spin h-5 w-5 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2"></div>
                                                    Loading risks...
                                                </div>
                                            ) : risks.length === 0 ? (
                                                <div className="p-8 text-center text-slate-500 text-sm">
                                                    No risks available.
                                                </div>
                                            ) : filteredRisks.length === 0 ? (
                                                <div className="p-8 text-center text-slate-500 text-sm">
                                                    No risks match your search.
                                                </div>
                                            ) : (
                                                filteredRisks.slice(0, 20).map(risk => (
                                                    <button
                                                        key={risk.id}
                                                        type="button"
                                                        onClick={() => setSelectedRiskId(risk.id)}
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
        </form >
    );
}
