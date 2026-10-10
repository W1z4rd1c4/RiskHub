import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, User, Activity } from 'lucide-react';
import { translateUiMessage, useTranslation } from '@/i18n/hooks';
import { InlineMessage } from '@/components/ui/inline-message';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { WizardFooter } from '@/components/ui/WizardFooter';
import type { Risk } from '@/types/risk';
import { useFocusFirstInvalidField } from '@/hooks/useFocusFirstInvalidField';
import { useRiskTypes, useTotalAssetsValue } from '@/hooks/useRiskHubConfig';
import { RiskFormIdentityStep } from './RiskFormIdentityStep';
import { RiskFormOwnershipStep } from './RiskFormOwnershipStep';
import { RiskFormScoringStep } from './RiskFormScoringStep';
import {
    getUniqueRiskOwnerRoles,
    useRiskFormWorkflow,
    useRiskScorePresentation,
} from './riskFormWorkflow';
import { useRiskLookups } from './useRiskLookups';
import { useRiskOwnerSearch } from './useRiskOwnerSearch';

interface RiskFormProps {
    initialData?: Risk;
    isEdit?: boolean;
    onSuccess?: (riskId: number, acceptNavigation?: () => void) => void | Promise<void>;
    /** Page shown after an approval-routed submit (D12 / PM-2). */
    approvalReturnTo?: string;
    onCancel?: () => void;
    firstStepBackLabel?: string;
}

export function RiskForm({
    initialData,
    isEdit = false,
    onSuccess,
    approvalReturnTo,
    onCancel,
    firstStepBackLabel,
}: RiskFormProps) {
    const navigate = useNavigate();
    const { t } = useTranslation(['risks', 'common', 'errorKeys']);
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
    } = useRiskLookups();
    // Owner search/filter
    const [ownerSearch, setOwnerSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('');

    const {
        confirmationDialog,
        currentStep,
        error,
        failedValidationCount,
        fieldErrors,
        formData,
        isSubmitting,
        handleInputChange,
        selectOwner,
        nextStep,
        prevStep,
        requestLocalLeave,
        setCurrentStep,
        submit,
    } = useRiskFormWorkflow({
        initialData,
        isEdit,
        onSuccess,
        approvalReturnTo,
        riskTypes,
    });

    // §4.8 / AX-04: a failed step check moves focus to the first invalid field.
    const formRef = useFocusFirstInvalidField(failedValidationCount);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        await submit();
    };

    const ownerLookup = useRiskOwnerSearch(ownerSearch, formData.department_id);
    const users = ownerLookup.users;
    const filteredUsers = users.filter((user) => !roleFilter || user.role_name === roleFilter);
    const uniqueRoles = [...new Set([...getUniqueRiskOwnerRoles(users), ...(roleFilter ? [roleFilter] : [])])];

    return (
        <>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto">
            {/* Multi-step indicator */}
            <StepIndicator
                steps={steps}
                currentStep={currentStep}
                isStepClickable={(idx) => !isSubmitting && (isEdit || idx < currentStep)}
                onStepClick={(idx) => setCurrentStep(idx)}
            />

            <div className="glass-card min-h-[480px] flex flex-col">

                {error && (
                    <InlineMessage tone="danger" className="mb-6">
                        {translateUiMessage(t, error)}
                    </InlineMessage>
                )}

                <fieldset disabled={isSubmitting} className="min-w-0 flex-1 space-y-6">
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
                            handleInputChange={handleInputChange}
                        />
                    )}

                    {currentStep === 1 && (
                        <RiskFormOwnershipStep
                            t={t}
                            formData={formData}
                            fieldErrors={fieldErrors}
                            departments={departments}
                            filteredUsers={filteredUsers}
                            ownerLookupStatus={ownerLookup.status}
                            ownerResultsLimited={ownerLookup.limited}
                            ownerResultsHiddenByRole={users.length > 0 && filteredUsers.length === 0}
                            retryOwnerSearch={ownerLookup.retry}
                            selectOwner={selectOwner}
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

                </fieldset>

                <WizardFooter
                    className="mt-12 pt-8"
                    stepIndex={currentStep}
                    stepCount={steps.length}
                    isSubmitting={isSubmitting}
                    cancelLabel={firstStepBackLabel || t('common:actions.cancel')}
                    onCancel={() => requestLocalLeave(() => {
                        if (onCancel) {
                            onCancel();
                        } else {
                            void navigate('/risks');
                        }
                    })}
                    onBack={prevStep}
                    onNext={(event) => nextStep(event)}
                    submitLabel={isEdit ? t('risks:edit_risk') : t('risks:create_risk')}
                    nextTestId="risk-form-next-button"
                    submitTestId="risk-form-submit-button"
                />
            </div>
        </form>
        {confirmationDialog}
        </>
    );
}
