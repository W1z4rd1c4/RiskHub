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
    Target,
    Search,
    Plus,
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

function formatFrequencyLabel(value: string): string {
    return value
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ControlForm({ initialData, isEdit = false, onSuccess, onCancel }: ControlFormProps) {
    const navigate = useNavigate();
    const { t } = useTranslation(['controls', 'common', 'errorKeys']);
    const steps = [
        { id: 'identity', title: t('controls:form.steps.identity', 'Identity'), icon: Info },
        { id: 'ownership', title: t('controls:form.steps.ownership', 'Ownership'), icon: User },
        { id: 'execution', title: t('controls:form.steps.execution', 'Execution'), icon: Settings },
        { id: 'risk', title: t('controls:form.steps.risk_status', 'Risk & Status'), icon: ShieldCheck },
        { id: 'link_risk', title: t('controls:form.steps.link_risk', 'Link Risk'), icon: LinkIcon }
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
            setError(t('controls:form.validation.name_required', 'Control Name is required.'));
            return false;
        }
        if (!formData.description?.trim()) {
            setError(t('controls:form.validation.description_required', 'Description is required.'));
            return false;
        }
        return true;
    };

    const validateStep1 = () => {
        if (!formData.control_owner_id) {
            setError(t('controls:form.validation.owner_required', 'Control Owner is required.'));
            return false;
        }
        if (!formData.process_owner_position?.trim()) {
            setError(t('controls:form.validation.owner_position_required', 'Owner Position is required.'));
            return false;
        }
        if (!formData.department_id) {
            setError(t('controls:form.validation.department_required', 'Department is required.'));
            return false;
        }
        return true;
    };

    const validateStep2 = () => {
        if (!formData.data_source?.trim()) {
            setError(t('controls:form.validation.data_source_required', 'Data Source is required.'));
            return false;
        }
        if (!formData.methodology_reference?.trim()) {
            setError(t('controls:form.validation.methodology_reference_required', 'Methodology Reference is required.'));
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
                            {isLoadingLookups ? (
                                <div className="text-slate-500 text-sm">{t('loading.generic', { ns: 'common' })}</div>
                            ) : (
                                <>
                                    <div className="grid md:grid-cols-2 gap-8">
                                        {/* Department Selection */}
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{t('common:labels.department')}</label>
                                            <div className="grid grid-cols-1 gap-2">
                                                <ThemedSelect
                                                    value={formData.department_id?.toString() ?? ''}
                                                    onValueChange={(v) => handleInputChange('department_id', v ? parseInt(v) : undefined)}
                                                    placeholder={t('form.placeholders.select_department')}
                                                    allowEmpty
                                                    emptyLabel={t('form.placeholders.select_department')}
                                                    className="w-full"
                                                    options={departments.map(dept => ({ value: dept.id.toString(), label: `${dept.name} (${dept.code})` }))}
                                                />
                                                <div className="mt-4">
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('controls:form.labels.owner_position', 'Owner Position')}</label>
                                                    <input
                                                        type="text"
                                                        value={formData.process_owner_position || ''}
                                                        onChange={(e) => handleInputChange('process_owner_position', e.target.value)}
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-600"
                                                        placeholder={t('form.placeholders.process_owner_position')}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Control Owner Selection */}
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{t('controls:fields.owner')}</label>

                                            {/* Role filter chips */}
                                            <div className="flex flex-wrap gap-1.5 mb-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setRoleFilter('')}
                                                    className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${!roleFilter
                                                        ? 'bg-accent text-white shadow-[0_0_10px_rgba(30,132,255,0.3)]'
                                                        : 'bg-white/5 text-slate-500 hover:bg-white/10'
                                                        }`}
                                                >
                                                    {t('common:labels.all')}
                                                </button>
                                                {uniqueRoles.map(role => (
                                                    <button
                                                        key={role}
                                                        type="button"
                                                        onClick={() => {
                                                            setRoleFilter(role);
                                                            // Find all users with this role (not filtered by department)
                                                            const usersWithRole = users.filter(u => u.role_name === role);
                                                            // Auto-select if only one user, else clear owner
                                                            if (usersWithRole.length === 1) {
                                                                handleInputChange('control_owner_id', usersWithRole[0].id);
                                                                // Department will auto-fill via handleInputChange
                                                            } else {
                                                                handleInputChange('control_owner_id', undefined);
                                                                handleInputChange('department_id', undefined);
                                                            }
                                                        }}
                                                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${roleFilter === role
                                                            ? 'bg-accent text-white shadow-[0_0_10px_rgba(30,132,255,0.3)]'
                                                            : 'bg-white/5 text-slate-500 hover:bg-white/10'
                                                            }`}
                                                    >
                                                        {role}
                                                    </button>
                                                ))}
                                            </div>

                                            {formData.control_owner_id ? (
                                                <div className="flex items-center justify-between bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 animate-in zoom-in-95 duration-200">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                                                            <User className="h-4 w-4 text-accent" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-white">
                                                                {users.find(u => u.id === formData.control_owner_id)?.name}
                                                            </p>
                                                            <p className="text-[10px] text-slate-400">
                                                                {users.find(u => u.id === formData.control_owner_id)?.email}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleInputChange('control_owner_id', undefined)}
                                                        className="p-1 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-colors"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        placeholder={t('form.placeholders.search_owners')}
                                                        value={ownerSearch}
                                                        onChange={(e) => setOwnerSearch(e.target.value)}
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-600"
                                                    />
                                                    <div className="max-h-[160px] overflow-y-auto rounded-xl border border-white/5 divide-y divide-white/5 custom-scrollbar bg-white/[0.02]">
                                                        {filteredUsers.length === 0 ? (
                                                            <div className="p-4 text-center text-xs text-slate-500 italic">{t('common:empty.no_owners_found')}</div>
                                                        ) : (
                                                            filteredUsers.map(user => (
                                                                <button
                                                                    key={user.id}
                                                                    type="button"
                                                                    onClick={() => handleInputChange('control_owner_id', user.id)}
                                                                    className="w-full px-4 py-2.5 text-left hover:bg-white/5 transition-all flex items-center justify-between group"
                                                                >
                                                                    <div>
                                                                        <p className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{user.name}</p>
                                                                        <p className="text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors uppercase tracking-widest">{user.role_name}</p>
                                                                    </div>
                                                                    <Plus className="h-3 w-3 text-slate-700 group-hover:text-accent transition-colors" />
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
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
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('controls:form.labels.data_source_methodology', 'Data Source & Methodology')}</label>
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
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('controls:form.labels.inherent_risk_level', 'Inherent Risk Level (1-5)')}</label>
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
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('controls:form.labels.initial_status', 'Initial Status')}</label>
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
                                    {t('controls:form.labels.link_to_risk_optional', 'Link to Risk (Optional)')}
                                </h3>

                                {selectedRisk ? (
                                    <div className="space-y-6">
                                        {/* Selected Risk Display */}
                                        <div className="p-4 bg-accent/10 border border-accent/30 rounded-xl">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-bold text-white">{selectedRisk.name}</p>
                                                    <p className="text-xs text-slate-400 mt-1">{selectedRisk.process} • {selectedRisk.category || t('controls:form.labels.uncategorized', 'Uncategorized')}</p>
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
                                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('controls:form.labels.effectiveness', 'Effectiveness')}</label>
                                                <ThemedSelect
                                                    value={riskEffectiveness}
                                                    onValueChange={(v) => setRiskEffectiveness(v as ControlEffectiveness)}
                                                    className="w-full"
                                                    options={[
                                                        { value: 'high', label: t('controls:form.effectiveness.high', 'High') },
                                                        { value: 'medium', label: t('controls:form.effectiveness.medium', 'Medium') },
                                                        { value: 'low', label: t('controls:form.effectiveness.low', 'Low') },
                                                    ]}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('common:labels.notes')} ({t('common:labels.none', 'Optional')})</label>
                                                <input
                                                    type="text"
                                                    value={linkNotes}
                                                    onChange={(e) => setLinkNotes(e.target.value)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                                    placeholder={t('form.placeholders.link_rationale')}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {/* Filters Row */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <ThemedSelect
                                                value={selectedDept}
                                                onValueChange={setSelectedDept}
                                                placeholder={t('form.placeholders.all_departments')}
                                                allowEmpty
                                                emptyLabel={t('form.placeholders.all_departments')}
                                                options={uniqueDepartments.map(d => ({ value: d, label: d }))}
                                            />

                                            <ThemedSelect
                                                value={selectedProcess}
                                                onValueChange={setSelectedProcess}
                                                placeholder={t('form.placeholders.all_processes')}
                                                allowEmpty
                                                emptyLabel={t('form.placeholders.all_processes')}
                                                options={uniqueProcesses.map(p => ({ value: p, label: p }))}
                                            />

                                            <ThemedSelect
                                                value={selectedCategory}
                                                onValueChange={setSelectedCategory}
                                                placeholder={t('form.placeholders.all_categories')}
                                                allowEmpty
                                                emptyLabel={t('form.placeholders.all_categories')}
                                                options={uniqueCategories.map(c => ({ value: c, label: c }))}
                                            />
                                        </div>

                                        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                                            <input
                                                type="text"
                                                placeholder={t('form.placeholders.search_risks')}
                                                value={riskSearch}
                                                onChange={(e) => setRiskSearch(e.target.value)}
                                                className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-400"
                                            />
                                        </div>

                                        <div className="max-h-[200px] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5 custom-scrollbar">
                                            {isLoadingRisks ? (
                                                <div className="p-8 text-center text-slate-500 text-sm">
                                                    <div className="animate-spin h-5 w-5 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2"></div>
                                                    {t('common:loading.risk_data', 'Loading risks...')}
                                                </div>
                                            ) : risks.length === 0 ? (
                                                <div className="p-8 text-center text-slate-500 text-sm">
                                                    {t('common:empty.no_risks_found')}
                                                </div>
                                            ) : filteredRisks.length === 0 ? (
                                                <div className="p-8 text-center text-slate-500 text-sm">
                                                    {t('common:labels.no_results')}
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
                                                            <p className="text-sm font-bold text-white truncate" title={risk.name}>{risk.name}</p>
                                                            <p className="text-[10px] text-slate-500 mt-1 truncate" title={risk.process}>{risk.process}</p>
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
                                                                <span className="text-[10px] text-slate-600 italic">{t('common:empty.no_description')}</span>
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
                            {isSubmitting ? t('common:loading.generic', 'Saving...') : (isEdit ? t('controls:edit_control') : t('controls:create_control'))}
                            <Save className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
        </form >
    );
}
