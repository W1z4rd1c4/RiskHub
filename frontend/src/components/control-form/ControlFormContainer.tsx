import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Save,
    X,
    ChevronRight,
    ChevronLeft,
    AlertCircle,
    Info,
    User,
    Settings,
    ShieldCheck,
    Link as LinkIcon,
    Clock,
    CheckCircle
} from 'lucide-react';
import { parseUpdateResult } from '@/lib/approvalUi';
import { useTranslation } from '@/i18n/hooks';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { controlApi } from '@/services/controlApi';
import { ApiClientError } from '@/services/apiClient';
import { lookupApi } from '@/services/lookupApi';
import type { UserLookupItem } from '@/services/lookupApi';
import { riskApi } from '@/services/riskApi';
import type { Control, ControlCreate, ControlUpdate } from '@/types/control';
import { ControlForm as ControlFormType, ControlFrequency, ControlStatus } from '@/types/control';
import type { RiskSummary, ControlEffectiveness } from '@/types/risk';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { ControlFormOwnershipStep } from './ControlFormOwnershipStep';
import { ControlFormRiskLinkStep } from './ControlFormRiskLinkStep';
import { formatFrequencyLabel } from './controlFormUtils';

interface ControlFormProps {
    initialData?: Control;
    isEdit?: boolean;
    onSuccess?: (controlId: number) => void;
    onCancel?: () => void;
}

interface DepartmentOption {
    id: number;
    name: string;
    code: string;
}

export function ControlForm({ initialData, isEdit = false, onSuccess, onCancel }: ControlFormProps) {
    const navigate = useNavigate();
    const { t } = useTranslation(['controls', 'common', 'errorKeys']);
    const steps = [
        { id: 'identity', title: t('controls:form.steps.identity'), icon: Info },
        { id: 'ownership', title: t('controls:form.steps.ownership'), icon: User },
        { id: 'execution', title: t('controls:form.steps.execution'), icon: Settings },
        { id: 'risk', title: t('controls:form.steps.risk_status'), icon: ShieldCheck },
        { id: 'link_risk', title: t('controls:form.steps.link_risk'), icon: LinkIcon }
    ];
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Approval-queued state for edit flows (HTTP 202)
    const [approvalQueued, setApprovalQueued] = useState<{ id: number; message: string } | null>(null);

    // Lookup data
    const [users, setUsers] = useState<UserLookupItem[]>([]);
    const [departments, setDepartments] = useState<DepartmentOption[]>([]);
    const [isLoadingLookups, setIsLoadingLookups] = useState(true);

    // Risk Linking State
    const [risks, setRisks] = useState<RiskSummary[]>([]);
    const [riskSearch, setRiskSearch] = useState('');
    const [isLoadingRisks, setIsLoadingRisks] = useState(false);

    // Owner search/filter
    const [ownerSearch, setOwnerSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('');

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


    const handleInputChange = (field: keyof Control, value: unknown) => {
        setFormData(prev => {
            const newData = { ...prev, [field]: value };

            // Auto-fill department when owner is selected
            if (field === 'control_owner_id' && value) {
                const selectedUser = users.find(u => u.id === value);
                if (selectedUser?.department_id) {
                    newData.department_id = selectedUser.department_id;
                }
            }

            return newData;
        });
        setError(null); // Clear error on change
    };

    const validateStep0 = () => {
        if (!formData.name?.trim()) {
            setError(t('controls:form.validation.name_required'));
            return false;
        }
        if (!formData.description?.trim()) {
            setError(t('controls:form.validation.description_required'));
            return false;
        }
        return true;
    };

    const validateStep1 = () => {
        if (!formData.control_owner_id) {
            setError(t('controls:form.validation.owner_required'));
            return false;
        }
        if (!formData.process_owner_position?.trim()) {
            setError(t('controls:form.validation.owner_position_required'));
            return false;
        }
        if (!formData.department_id) {
            setError(t('controls:form.validation.department_required'));
            return false;
        }
        return true;
    };

    const validateStep2 = () => {
        if (!formData.data_source?.trim()) {
            setError(t('controls:form.validation.data_source_required'));
            return false;
        }
        if (!formData.methodology_reference?.trim()) {
            setError(t('controls:form.validation.methodology_reference_required'));
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
            risk.name?.toLowerCase().includes(riskSearch.toLowerCase()) ||
            risk.process.toLowerCase().includes(riskSearch.toLowerCase()) ||
            risk.category?.toLowerCase().includes(riskSearch.toLowerCase()) ||
            risk.department_name?.toLowerCase().includes(riskSearch.toLowerCase());

        const matchesDept = !selectedDept || risk.department_name === selectedDept;
        const matchesProcess = !selectedProcess || risk.process === selectedProcess;
        const matchesCategory = !selectedCategory || risk.category === selectedCategory;

        return matchesSearch && matchesDept && matchesProcess && matchesCategory;
    });

    // Filtered users based on search, role, AND department
    const filteredUsers = users.filter(user => {
        const matchesSearch = !ownerSearch ||
            user.name?.toLowerCase().includes(ownerSearch.toLowerCase()) ||
            user.email?.toLowerCase().includes(ownerSearch.toLowerCase());
        const matchesRole = !roleFilter || user.role_name === roleFilter;
        // If department is selected, filter to that department's users
        const matchesDepartment = !formData.department_id || user.department_id === formData.department_id;
        return matchesSearch && matchesRole && matchesDepartment;
    });

    // Get unique roles for filter - role is an object with name property
    const uniqueRoles: string[] = [...new Set(users.map(u => u.role_name).filter((r): r is string => !!r))];

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
            setApprovalQueued(null);

            let controlId = initialData?.id;

            if (isEdit && initialData) {
                const result = await controlApi.updateControl(initialData.id, formData as ControlUpdate);
                // Use standardized helper to check for 202 approval-queued response
                const parsed = parseUpdateResult(result);
                if (parsed.kind === 'approval') {
                    setApprovalQueued({
                        id: parsed.approvalId,
                        message: parsed.message,
                    });
                    setIsSubmitting(false);
                    return; // Stay on form, don't navigate
                }
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
                }
            }

            if (onSuccess && controlId) {
                onSuccess(controlId);
            } else if (controlId) {
                navigate(`/controls/${controlId}`);
            } else {
                navigate('/controls');
            }
        } catch (err: unknown) {
            console.error('Error saving control:', err);
            if (err instanceof ApiClientError) {
                setError(err.messageKey);
            } else {
                setError('errorKeys.save_control_failed');
            }
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
        // In edit mode, allow free navigation to any step
        if (isEdit) {
            setError(null);
            setCurrentStep(index);
            return;
        }

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
            <StepIndicator
                steps={steps}
                currentStep={currentStep}
                isStepClickable={(idx) => isEdit || idx <= currentStep + 1}
                onStepClick={handleStepClick}
            />

            <div className="glass-card min-h-[400px] flex flex-col">
                {/* Approval-queued banner */}
                {approvalQueued && (
                    <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                        <Clock className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-amber-200 text-sm font-medium">
                                {t('approval_submitted', { ns: 'errorKeys' })} (ID: {approvalQueued.id})
                            </p>
                            <p className="text-amber-400/80 text-xs mt-1">
                                {approvalQueued.message.startsWith('errorKeys.') ? t(approvalQueued.message, { ns: 'errorKeys' }) : approvalQueued.message}
                            </p>
                            <div className="mt-3 flex gap-3">
                                <Link
                                    to="/approvals"
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-100 transition-colors"
                                >
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    {t('common:actions.view')} {t('approvals:title', { ns: 'approvals', defaultValue: 'Approvals' })}
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => setApprovalQueued(null)}
                                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    {t('common:actions.close')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-medium">
                        <AlertCircle className="h-5 w-5" />
                        {error.startsWith('errorKeys.') ? t(error, { ns: 'errorKeys' }) : error}
                    </div>
                )}

                <div className="flex-1 space-y-6">
                    {currentStep === 0 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('controls:fields.name')}</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
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
                                    onChange={(e) => handleInputChange('description', e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-400 resize-none"
                                    placeholder={t('form.placeholders.description')}
                                />
                            </div>
                        </div>
                    )}

                    {currentStep === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <ControlFormOwnershipStep
                                t={t}
                                isLoadingLookups={isLoadingLookups}
                                formData={formData}
                                departments={departments}
                                users={users}
                                filteredUsers={filteredUsers}
                                uniqueRoles={uniqueRoles}
                                roleFilter={roleFilter}
                                ownerSearch={ownerSearch}
                                setRoleFilter={setRoleFilter}
                                setOwnerSearch={setOwnerSearch}
                                handleInputChange={handleInputChange}
                            />
                        </div>
                    )}


                    {currentStep === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('common:labels.frequency')}</label>
                                    <ThemedSelect
                                        value={formData.frequency || ControlFrequency.MONTHLY}
                                        onValueChange={(v) => handleInputChange('frequency', v)}
                                        className="w-full"
                                        options={Object.values(ControlFrequency).map((f) => ({ value: f, label: formatFrequencyLabel(f) }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('common:labels.form')}</label>
                                    <ThemedSelect
                                        value={formData.control_form || ControlFormType.MANUAL}
                                        onValueChange={(v) => handleInputChange('control_form', v)}
                                        className="w-full"
                                        options={Object.values(ControlFormType).map(f => ({ value: f, label: f.toUpperCase() }))}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('controls:form.labels.data_source_methodology')}</label>
                                <div className="space-y-4">
                                    <input
                                        type="text"
                                        value={formData.data_source || ''}
                                        onChange={(e) => handleInputChange('data_source', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                        placeholder={t('form.placeholders.data_source')}
                                    />
                                    <input
                                        type="text"
                                        value={formData.methodology_reference || ''}
                                        onChange={(e) => handleInputChange('methodology_reference', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                        placeholder={t('form.placeholders.methodology_reference')}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 3 && (
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
                                        onChange={(e) => handleInputChange('risk_level', parseInt(e.target.value))}
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
                            <ControlFormRiskLinkStep
                                t={t}
                                selectedRisk={selectedRisk}
                                setSelectedRiskId={setSelectedRiskId}
                                riskEffectiveness={riskEffectiveness}
                                setRiskEffectiveness={setRiskEffectiveness}
                                linkNotes={linkNotes}
                                setLinkNotes={setLinkNotes}
                                selectedDept={selectedDept}
                                setSelectedDept={setSelectedDept}
                                selectedProcess={selectedProcess}
                                setSelectedProcess={setSelectedProcess}
                                selectedCategory={selectedCategory}
                                setSelectedCategory={setSelectedCategory}
                                uniqueDepartments={uniqueDepartments}
                                uniqueProcesses={uniqueProcesses}
                                uniqueCategories={uniqueCategories}
                                riskSearch={riskSearch}
                                setRiskSearch={setRiskSearch}
                                isLoadingRisks={isLoadingRisks}
                                risks={risks}
                                filteredRisks={filteredRisks}
                            />
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="mt-12 flex justify-between items-center pt-8 border-t border-white/5">
                    <button
                        type="button"
                        onClick={() => {
                            if (currentStep === 0) {
                                if (onCancel) {
                                    onCancel();
                                } else {
                                    navigate('/controls');
                                }
                            } else {
                                prevStep();
                            }
                        }}
                        className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-white transition-colors uppercase tracking-widest"
                    >
                        {currentStep === 0 ? <X className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                        {currentStep === 0 ? t('common:actions.cancel') : t('common:actions.back')}
                    </button>

                    {currentStep < steps.length - 1 ? (
                        <button
                            key="next-step"
                            type="button"
                            onClick={nextStep}
                            className="btn-primary"
                        >
                            {t('common:actions.next')} <ChevronRight className="h-4 w-4" />
                        </button>
                    ) : (
                        <button
                            key="submit"
                            type="submit"
                            disabled={isSubmitting}
                            className="btn-primary"
                        >
                            {isSubmitting ? t('common:loading.generic') : (isEdit ? t('controls:edit_control') : t('controls:create_control'))}
                            <Save className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
        </form >
    );
}
