import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import {
    Save,
    X,
    AlertCircle,
    Target,
    Search,
    User,
    Calendar,
    Clock,
    CheckCircle
} from 'lucide-react';
import { parseUpdateResult } from '@/lib/approvalUi';
import { kriApi } from '@/services/kriApi';
import { riskApi } from '@/services/riskApi';
import { userApi } from '@/services/userApi';
import { ApiClientError } from '@/services/apiClient';
import { KRIFrequencies, type KRICreate, type KRIFrequency } from '@/types/kri';
import type { RiskSummary } from '@/types/risk';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

interface KRIFormProps {
    initialData?: Partial<KRICreate>;
    isEdit?: boolean;
    kriId?: number;
}

export function KRIForm({ initialData, isEdit = false, kriId }: KRIFormProps) {
    const { t } = useTranslation(['kris', 'common', 'errorKeys', 'approvals']);
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Approval-queued state for edit flows (HTTP 202)
    const [approvalQueued, setApprovalQueued] = useState<{ id: number; message: string } | null>(null);

    // Step state
    const [currentStep, setCurrentStep] = useState(0);

    // Risk lookup
    const [risks, setRisks] = useState<RiskSummary[]>([]);
    const [riskSearch, setRiskSearch] = useState('');
    const [isLoadingRisks, setIsLoadingRisks] = useState(true);

    const [formData, setFormData] = useState<Partial<KRICreate>>({
        risk_id: undefined,
        metric_name: '',
        description: '',
        current_value: 0,
        lower_limit: 0,
        upper_limit: 100,
        unit: '%',
        frequency: 'quarterly',
        reporting_owner_id: undefined,
        ...initialData
    });

    // User list for reporting owner selection (scoped visibility)
    const [users, setUsers] = useState<{ id: number; name: string; email: string }[]>([]);

    useEffect(() => {
        const loadRisks = async () => {
            try {
                setIsLoadingRisks(true);
                setError(null);
                const response = await riskApi.getRisks({ skip: 0, limit: 100 });
                if (response?.items) {
                    setRisks(response.items);
                }
            } catch (err: unknown) {
                console.error('Error loading risks:', err);
                setError('errorKeys.request_failed');
            } finally {
                setIsLoadingRisks(false);
            }
        };
        loadRisks();
    }, []);

    // Load users for reporting owner dropdown (scoped visibility)
    useEffect(() => {
        const loadUsers = async () => {
            try {
                const userList = await userApi.listVisibleUsers();
                setUsers(userList);
            } catch (err) {
                console.error('Error loading users:', err);
            }
        };
        loadUsers();
    }, []);

    const handleInputChange = <K extends keyof KRICreate>(field: K, value: KRICreate[K] | undefined) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setError(null); // Clear error on change
    };

    const validateStep1 = () => {
        if (!formData.risk_id) {
            setError(t('kris:form.validation.risk_required'));
            return false;
        }
        return true;
    };

    const validateStep2 = () => {
        if (!formData.metric_name?.trim()) {
            setError(t('kris:form.validation.metric_name_required'));
            return false;
        }
        if (!formData.description?.trim()) {
            setError(t('kris:form.validation.description_required'));
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
            setApprovalQueued(null);

            if (isEdit && kriId) {
                const result = await kriApi.updateKRI(kriId, formData);
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
                const newKRI = await kriApi.createKRI(formData as KRICreate);
                navigate(`/kris/${newKRI.id}`);
                return;
            }

            navigate(`/kris/${kriId}`);
        } catch (err: unknown) {
            console.error('Error saving KRI:', err);
            if (err instanceof ApiClientError) {
                setError(err.messageKey);
            } else {
                setError('errorKeys.save_kri_failed');
            }
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
            risk.name?.toLowerCase().includes(riskSearch.toLowerCase()) ||
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
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="h-5 w-5" />
                        {error.startsWith('errorKeys.') ? t(error, { ns: 'errorKeys' }) : error}
                    </div>
                )}

                <div className="flex-1 space-y-8">

                    {/* STEP 1: Link to Risk */}
                    {currentStep === 0 && (
                        <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h3 className="text-[10px] font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Target className="h-4 w-4 text-accent" />
                                {t('kris:actions.link_risk')}
                            </h3>

                            {selectedRisk ? (
                                <div className="p-4 bg-accent/10 border border-accent/30 rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-bold text-white">{selectedRisk.name}</p>
                                            <p className="text-xs text-slate-400 mt-1">{selectedRisk.process} • {selectedRisk.category || t('common:labels.unknown')}</p>
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
                                            className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                                        />
                                    </div>

                                    <div className="max-h-[400px] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5 custom-scrollbar">
                                        {isLoadingRisks ? (
                                            <div className="p-8 text-center text-slate-500 text-sm">
                                                <div className="animate-spin h-5 w-5 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2"></div>
                                                {t('common:loading.risk_data')}
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
                                                    onClick={() => handleInputChange('risk_id', risk.id)}
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
                        </section>
                    )}

                    {/* STEP 2: KRI Details */}
                    {currentStep === 1 && (
                        <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h3 className="text-[10px] font-black text-white uppercase tracking-widest mb-4">{t('kris:fields.name')} {t('common:labels.details')}</h3>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                        {t('kris:fields.name')} *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        autoFocus
                                        value={formData.metric_name}
                                        onChange={(e) => handleInputChange('metric_name', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                        placeholder={t('form.placeholders.metric_name')}
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                        {t('common:labels.description')} *
                                    </label>
                                    <textarea
                                        required
                                        rows={3}
                                        value={formData.description}
                                        onChange={(e) => handleInputChange('description', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all resize-none"
                                        placeholder={t('form.placeholders.description')}
                                    />
                                </div>

                                <div className="grid md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                            {t('kris:fields.current_value')} *
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
                                            {t('kris:fields.lower_limit')}
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
                                            {t('kris:fields.upper_limit')}
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
                                        {t('kris:fields.unit')}
                                    </label>
                                    <ThemedSelect
                                        value={formData.unit || '%'}
                                        onValueChange={(v) => handleInputChange('unit', v)}
                                        className="w-full"
                                        options={[
                                            { value: '%', label: t('kris:form.units.percentage') },
                                            { value: 'count', label: t('kris:form.units.count') },
                                            { value: 'days', label: t('kris:form.units.days') },
                                            { value: 'hours', label: t('kris:form.units.hours') },
                                            { value: 'CZK', label: 'CZK' },
                                            { value: 'EUR', label: 'EUR' },
                                            { value: 'ratio', label: t('kris:form.units.ratio') },
                                        ]}
                                    />
                                </div>

                                {/* Frequency and Reporting Owner */}
                                <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            {t('kris:fields.frequency')}
                                        </label>
                                        <ThemedSelect
                                            value={formData.frequency || 'quarterly'}
                                            onValueChange={(v) => {
                                                if ((KRIFrequencies as readonly string[]).includes(v)) {
                                                    handleInputChange('frequency', v as KRIFrequency);
                                                }
                                            }}
                                            className="w-full"
                                            options={[
                                                { value: 'daily', label: t('frequencies.daily') },
                                                { value: 'weekly', label: t('frequencies.weekly') },
                                                { value: 'monthly', label: t('frequencies.monthly') },
                                                { value: 'quarterly', label: t('frequencies.quarterly') },
                                                { value: 'annually', label: t('frequencies.annually') },
                                            ]}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <User className="h-3 w-3" />
                                            {t('kris:fields.owner')}
                                        </label>
                                        <ThemedSelect
                                            value={formData.reporting_owner_id?.toString() ?? ''}
                                            onValueChange={(v) => handleInputChange('reporting_owner_id', v ? parseInt(v) : undefined)}
                                            placeholder={t('form.placeholders.reporting_owner_default')}
                                            allowEmpty
                                            emptyLabel={t('form.placeholders.reporting_owner_default')}
                                            className="w-full"
                                            options={users.map(user => ({ value: user.id.toString(), label: `${user.name} (${user.email})` }))}
                                        />
                                        <p className="text-[9px] text-slate-600 mt-1 ml-1">{t('kris:form.reporting_owner_hint')}</p>
                                    </div>
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
                                {t('common:actions.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={nextStep}
                                className="btn-primary"
                            >
                                {t('common:actions.next')}
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={prevStep}
                                className="text-slate-400 hover:text-white transition-colors font-bold text-sm"
                            >
                                {t('common:actions.back')}
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="btn-primary px-8"
                            >
                                {isSubmitting ? t('common:loading.generic') : (isEdit ? t('kris:edit_kri') : t('kris:create_kri'))}
                                <Save className="h-4 w-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </form>
    );
}
