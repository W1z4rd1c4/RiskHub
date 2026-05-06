import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { ApprovalQueuedBanner } from '@/components/forms/ApprovalQueuedBanner';
import { useFormStepNavigation } from '@/components/forms/FormStepContext';
import {
    resolveSubmitOutcome,
} from '@/components/forms/entityFormWorkflow';
import type { Control } from '@/types/control';
import type { ControlEffectiveness } from '@/types/risk';
import { ControlFormExecutionStep } from './ControlFormExecutionStep';
import { ControlFormIdentityStep } from './ControlFormIdentityStep';
import { ControlFormOwnershipStep } from './ControlFormOwnershipStep';
import { ControlFormRiskLinkStep } from './ControlFormRiskLinkStep';
import { ControlFormStatusStep } from './ControlFormStatusStep';
import {
    ControlRiskLinkStepProvider,
    type ControlRiskLinkStepContextValue,
} from './controlRiskLinkStepContext';
import { collectRiskFilterOptions, filterRisks, filterUsers, getUniqueRoles } from './controlFormFilters';
import { useControlFormLookups } from './useControlFormLookups';
import { useControlFormWorkflow } from './useControlFormWorkflow';

interface ControlFormProps {
    initialData?: Control;
    isEdit?: boolean;
    onSuccess?: (controlId: number) => void | Promise<void>;
    onCancel?: () => void;
    firstStepBackLabel?: string;
    allowRiskLinking?: boolean;
}

export function ControlForm({
    initialData,
    isEdit = false,
    onSuccess,
    onCancel,
    firstStepBackLabel,
    allowRiskLinking = true,
}: ControlFormProps) {
    const navigate = useNavigate();
    const { t } = useTranslation(['controls', 'common', 'errorKeys']);
    const steps = [
        { id: 'identity', title: t('controls:form.steps.identity'), icon: Info },
        { id: 'ownership', title: t('controls:form.steps.ownership'), icon: User },
        { id: 'execution', title: t('controls:form.steps.execution'), icon: Settings },
        { id: 'risk', title: t('controls:form.steps.risk_status'), icon: ShieldCheck },
        ...(allowRiskLinking
            ? [{ id: 'link_risk', title: t('controls:form.steps.link_risk'), icon: LinkIcon }]
            : []),
    ];
    const {
        users,
        departments,
        risks,
        isLoadingLookups,
        isLoadingRisks,
        dataErrorKey,
        reloadData,
    } = useControlFormLookups();
    const [riskSearch, setRiskSearch] = useState('');

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

    const {
        approvalQueued,
        currentStep,
        error,
        formData,
        isSubmitting,
        handleInputChange,
        setApprovalQueued,
        setCurrentStep,
        setError,
        submit,
        validateStep,
    } = useControlFormWorkflow({
        initialData,
        isEdit,
        onSuccess,
        users,
        t,
    });

    const { uniqueDepartments, uniqueProcesses, uniqueCategories } = collectRiskFilterOptions(risks);
    const filteredRisks = filterRisks(risks, {
        riskSearch,
        selectedDept,
        selectedProcess,
        selectedCategory,
    });
    const filteredUsers = filterUsers(users, {
        ownerSearch,
        roleFilter,
        departmentId: formData.department_id ?? undefined,
    });
    const uniqueRoles = getUniqueRoles(users);
    const selectedRisk = risks.find((risk) => risk.id === selectedRiskId);
    const visibleError = error ?? dataErrorKey;
    const riskLinkStepContext: ControlRiskLinkStepContextValue = {
        selectedRisk,
        setSelectedRiskId,
        riskEffectiveness,
        setRiskEffectiveness,
        linkNotes,
        setLinkNotes,
        selectedDept,
        setSelectedDept,
        selectedProcess,
        setSelectedProcess,
        selectedCategory,
        setSelectedCategory,
        uniqueDepartments,
        uniqueProcesses,
        uniqueCategories,
        riskSearch,
        setRiskSearch,
        isLoadingRisks,
        risks,
        filteredRisks,
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await submit({
            selectedRiskId: allowRiskLinking ? selectedRiskId : undefined,
            riskEffectiveness,
            linkNotes,
        });
    };

    const { handleStepClick, nextStep, prevStep } = useFormStepNavigation({
        currentStep,
        isEdit,
        maxStep: steps.length - 1,
        setCurrentStep,
        setError,
        validateStep,
    });

    const submitOutcome = resolveSubmitOutcome({ approvalQueued: Boolean(approvalQueued) });

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
                {submitOutcome.approvalQueued && approvalQueued && (
                    <ApprovalQueuedBanner
                        closeLabel={t('common:actions.close')}
                        message={approvalQueued.message.startsWith('errorKeys.') ? t(approvalQueued.message, { ns: 'errorKeys' }) : approvalQueued.message}
                        onClose={() => setApprovalQueued(null)}
                        title={t('approval_submitted', { ns: 'errorKeys' })}
                        viewApprovalsLabel={`${t('common:actions.view')} ${t('approvals:title', { ns: 'approvals', defaultValue: 'Approvals' })}`}
                    />
                )}

                {visibleError && (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-medium">
                        <AlertCircle className="h-5 w-5" />
                        <span>
                            {visibleError.startsWith('errorKeys.') ? t(visibleError, { ns: 'errorKeys' }) : visibleError}
                        </span>
                        {dataErrorKey && (
                            <button
                                type="button"
                                onClick={() => {
                                    void reloadData();
                                }}
                                className="ml-auto text-xs underline hover:text-rose-300 transition-colors"
                            >
                                {t('common:actions.retry')}
                            </button>
                        )}
                    </div>
                )}

                <div className="flex-1 space-y-6">
                    {currentStep === 0 && (
                        <ControlFormIdentityStep formData={formData} handleInputChange={handleInputChange} t={t} />
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
                        <ControlFormExecutionStep formData={formData} handleInputChange={handleInputChange} t={t} />
                    )}

                    {currentStep === 3 && (
                        <ControlFormStatusStep formData={formData} handleInputChange={handleInputChange} t={t} />
                    )}

                    {currentStep === 4 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <ControlRiskLinkStepProvider value={riskLinkStepContext}>
                                <ControlFormRiskLinkStep t={t} />
                            </ControlRiskLinkStepProvider>
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
                                    void navigate('/controls');
                                }
                            } else {
                                prevStep();
                            }
                        }}
                        className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-white transition-colors uppercase tracking-widest"
                    >
                        {currentStep === 0 ? <X className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                        {currentStep === 0 ? (firstStepBackLabel || t('common:actions.cancel')) : t('common:actions.back')}
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
