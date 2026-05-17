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
    Activity,
} from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { ApprovalQueuedBanner } from '@/components/forms/ApprovalQueuedBanner';
import type { Risk } from '@/types/risk';
import { useRiskTypes, useTotalAssetsValue } from '@/hooks/useRiskHubConfig';
import { RiskFormIdentityStep } from './RiskFormIdentityStep';
import { RiskFormOwnershipStep } from './RiskFormOwnershipStep';
import { RiskFormScoringStep } from './RiskFormScoringStep';
import {
    filterRiskOwners,
    getUniqueRiskOwnerRoles,
    useRiskFormWorkflow,
    useRiskScorePresentation,
} from './riskFormWorkflow';
import { useRiskLookups } from './useRiskLookups';

interface RiskFormProps {
    initialData?: Risk;
    isEdit?: boolean;
    onSuccess?: (riskId: number) => void | Promise<void>;
    onCancel?: () => void;
    firstStepBackLabel?: string;
}

export function RiskForm({
    initialData,
    isEdit = false,
    onSuccess,
    onCancel,
    firstStepBackLabel,
}: RiskFormProps) {
    const navigate = useNavigate();
    const { t } = useTranslation(['risks', 'common', 'errorKeys', 'approvals']);
    const steps = [
        { id: 'identity', title: t('risks:form.steps.identity'), icon: Info },
        { id: 'ownership', title: t('risks:form.steps.ownership'), icon: User },
        { id: 'scoring', title: t('risks:form.steps.scoring'), icon: Activity },
    ];
    const { riskTypes, isLoading: riskTypesLoading } = useRiskTypes();
    const { totalAssets } = useTotalAssetsValue();
    const { getScoreTextColor, getSliderAccent } = useRiskScorePresentation();

    const {
        departments,
        existingCategories,
        existingProcesses,
        subprocessesByProcess,
        users,
    } = useRiskLookups();
    const [showProcessDropdown, setShowProcessDropdown] = useState(false);
    const [showSubprocessDropdown, setShowSubprocessDropdown] = useState(false);
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

    // Owner search/filter
    const [ownerSearch, setOwnerSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('');

    const {
        approvalQueued,
        currentStep,
        error,
        fieldErrors,
        formData,
        isSubmitting,
        handleInputChange,
        nextStep,
        prevStep,
        setApprovalQueued,
        setCurrentStep,
        submit,
    } = useRiskFormWorkflow({
        initialData,
        isEdit,
        onSuccess,
        riskTypes,
        users,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await submit();
    };

    const filteredUsers = filterRiskOwners(users, ownerSearch, roleFilter, formData.department_id);
    const uniqueRoles = getUniqueRiskOwnerRoles(users);

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto">
            {/* Multi-step indicator */}
            <StepIndicator
                steps={steps}
                currentStep={currentStep}
                isStepClickable={(idx) => isEdit || idx < currentStep}
                onStepClick={(idx) => setCurrentStep(idx)}
            />

            <div className="glass-card min-h-[480px] flex flex-col">
                {/* Approval-queued banner */}
                {approvalQueued && (
                    <ApprovalQueuedBanner
                        closeLabel={t('common:actions.close')}
                        message={approvalQueued.message.startsWith('errorKeys.') ? t(approvalQueued.message, { ns: 'errorKeys' }) : approvalQueued.message}
                        onClose={() => setApprovalQueued(null)}
                        title={t('approval_submitted', { ns: 'errorKeys' })}
                        viewApprovalsLabel={`${t('common:actions.view')} ${t('approvals:title', { ns: 'approvals', defaultValue: 'Approvals' })}`}
                    />
                )}

                {error && (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-medium">
                        <AlertCircle className="h-5 w-5" />
                        {error.startsWith('errorKeys.') ? t(error, { ns: 'errorKeys' }) : error}
                    </div>
                )}

                <div className="flex-1 space-y-6">
                    {currentStep === 0 && (
                        <RiskFormIdentityStep
                            t={t}
                            formData={formData}
                            fieldErrors={fieldErrors}
                            riskTypes={riskTypes}
                            riskTypesLoading={riskTypesLoading}
                            existingProcesses={existingProcesses}
                            existingCategories={existingCategories}
                            subprocessesByProcess={subprocessesByProcess}
                            showProcessDropdown={showProcessDropdown}
                            showSubprocessDropdown={showSubprocessDropdown}
                            showCategoryDropdown={showCategoryDropdown}
                            setShowProcessDropdown={setShowProcessDropdown}
                            setShowSubprocessDropdown={setShowSubprocessDropdown}
                            setShowCategoryDropdown={setShowCategoryDropdown}
                            handleInputChange={handleInputChange}
                        />
                    )}

                    {currentStep === 1 && (
                        <RiskFormOwnershipStep
                            t={t}
                            formData={formData}
                            fieldErrors={fieldErrors}
                            departments={departments}
                            users={users}
                            filteredUsers={filteredUsers}
                            uniqueRoles={uniqueRoles}
                            ownerSearch={ownerSearch}
                            roleFilter={roleFilter}
                            setOwnerSearch={setOwnerSearch}
                            setRoleFilter={setRoleFilter}
                            handleInputChange={handleInputChange}
                        />
                    )}

                    {currentStep === 2 && (
                        <RiskFormScoringStep
                            t={t}
                            formData={formData}
                            totalAssets={totalAssets}
                            handleInputChange={handleInputChange}
                            getScoreTextColor={getScoreTextColor}
                            getSliderAccent={getSliderAccent}
                        />
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
                                    void navigate('/risks');
                                }
                                return;
                            }
                            prevStep();
                        }}
                        className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
                    >
                        {currentStep === 0 ? <X className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                        {currentStep === 0 ? (firstStepBackLabel || t('common:actions.cancel')) : t('common:actions.back')}
                    </button>

                    {currentStep < steps.length - 1 ? (
                        <button
                            type="button"
                            onClick={nextStep}
                            data-testid="risk-form-next-button"
                            className="btn-primary"
                        >
                            {t('common:actions.next')} <ChevronRight className="h-4 w-4" />
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            data-testid="risk-form-submit-button"
                            className="btn-primary px-8"
                        >
                            {isSubmitting ? t('common:loading.generic') : (isEdit ? t('risks:edit_risk') : t('risks:create_risk'))}
                            <Save className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
        </form >
    );
}
