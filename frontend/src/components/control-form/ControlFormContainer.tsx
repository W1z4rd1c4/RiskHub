import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Info,
    User,
    Settings,
    ShieldCheck,
    Link as LinkIcon,
} from 'lucide-react';
import { translateUiMessage, useTranslation } from '@/i18n/hooks';
import { useDirtyTaskGuard } from '@/hooks/useDirtyTaskGuard';
import { useFocusFirstInvalidField } from '@/hooks/useFocusFirstInvalidField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InlineMessage } from '@/components/ui/inline-message';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { WizardFooter } from '@/components/ui/WizardFooter';
import { useFormStepNavigation } from '@/components/forms/FormStepContext';
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
import {
    createControlFormSnapshot,
    useControlFormWorkflow,
} from './useControlFormWorkflow';

interface ControlFormProps {
    initialData?: Control;
    isEdit?: boolean;
    onSuccess?: (
        controlId: number,
        acceptNavigation?: () => void,
    ) => void | Promise<void>;
    /** Entity page shown after an approval-routed edit (D12 / PM-2). */
    approvalReturnTo?: string;
    onCancel?: () => void;
    firstStepBackLabel?: string;
    allowRiskLinking?: boolean;
    registerCloseRequest?: (requestClose: (() => void) | null) => void;
    /**
     * `card` (pages): the step body sits on the glass card surface.
     * `nested` (inside a dialog): a nested panel, never glass-in-popover (§4.10, §4.11).
     */
    surface?: 'card' | 'nested';
}

export function ControlForm({
    initialData,
    isEdit = false,
    onSuccess,
    approvalReturnTo,
    onCancel,
    firstStepBackLabel,
    allowRiskLinking = true,
    registerCloseRequest,
    surface = 'card',
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
        currentStep,
        error,
        fieldError,
        formData,
        isSubmitting,
        handleInputChange,
        setCurrentStep,
        setError,
        submit,
        validateStep,
    } = useControlFormWorkflow({
        initialData,
        isEdit,
        onSuccess,
        approvalReturnTo,
        users,
        t,
    });
    const currentSnapshot = createControlFormSnapshot(formData, {
        selectedRiskId: allowRiskLinking ? selectedRiskId : undefined,
        riskEffectiveness,
        linkNotes,
    });
    const {
        acceptCurrentSnapshot,
        confirmationDialog,
        requestLocalLeave,
    } = useDirtyTaskGuard({
        busy: isSubmitting,
        currentSnapshot,
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
    // §4.8 / AX-04: a failed step check shows its message on the field and
    // focuses it. The owner picker has no single input and announces its
    // error with role="alert" instead.
    const formRef = useFocusFirstInvalidField(fieldError);
    const fieldErrors: Partial<Record<keyof Control, string>> = fieldError ? { [fieldError.field]: fieldError.message } : {};
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
        if (isSubmitting) return;
        await submit({
            acceptCurrentSnapshot,
            selectedRiskId: allowRiskLinking ? selectedRiskId : undefined,
            riskEffectiveness,
            linkNotes,
            submittedSnapshot: currentSnapshot,
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

    const requestClose = useCallback(() => {
        if (isSubmitting) return;
        requestLocalLeave(() => {
            if (onCancel) {
                onCancel();
            } else {
                void navigate('/controls');
            }
        });
    }, [isSubmitting, navigate, onCancel, requestLocalLeave]);

    useEffect(() => {
        registerCloseRequest?.(requestClose);
        return () => registerCloseRequest?.(null);
    }, [registerCloseRequest, requestClose]);

    return (
        <>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto">
            {/*
              * Loaded-state sentinel for tests: the identity step (step 0) shows no
              * load-dependent UI, so the background lookups (users / departments /
              * risks) settling is otherwise invisible. Emitted only once every lookup
              * has resolved so tests can gate assertions on a fully-loaded form.
              */}
            {!isLoadingLookups && !isLoadingRisks && (
                <span data-testid="control-form-lookups-ready" className="sr-only" />
            )}
            {/* Multi-step indicator */}
            <StepIndicator
                steps={steps}
                currentStep={currentStep}
                isStepClickable={(idx) => !isSubmitting && (isEdit || idx <= currentStep + 1)}
                onStepClick={handleStepClick}
            />

            <Card tone={surface === 'nested' ? 'nested' : 'default'} className="min-h-[400px] flex flex-col">
                {visibleError && (
                    <InlineMessage
                        tone="danger"
                        className="mb-6"
                        action={dataErrorKey ? (
                            <Button variant="outline" size="compact" onClick={() => void reloadData()}>
                                {t('common:actions.retry')}
                            </Button>
                        ) : undefined}
                    >
                        {translateUiMessage(t, visibleError)}
                    </InlineMessage>
                )}

                <fieldset disabled={isSubmitting} className="min-w-0 flex-1 space-y-6">
                    {currentStep === 0 && (
                        <ControlFormIdentityStep formData={formData} fieldErrors={fieldErrors} handleInputChange={handleInputChange} t={t} />
                    )}

                    {currentStep === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <ControlFormOwnershipStep
                                t={t}
                                isLoadingLookups={isLoadingLookups}
                                formData={formData}
                                fieldErrors={fieldErrors}
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
                        <ControlFormExecutionStep formData={formData} fieldErrors={fieldErrors} handleInputChange={handleInputChange} t={t} />
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
                </fieldset>

                <WizardFooter
                    className="mt-12 pt-8"
                    stepIndex={currentStep}
                    stepCount={steps.length}
                    isSubmitting={isSubmitting}
                    cancelLabel={firstStepBackLabel || t('common:actions.cancel')}
                    onCancel={requestClose}
                    onBack={prevStep}
                    onNext={() => nextStep()}
                    submitLabel={isEdit ? t('controls:edit_control') : t('controls:create_control')}
                    nextTestId="control-form-next-button"
                    submitTestId="control-form-submit-button"
                />
            </Card>
        </form>
        {confirmationDialog}
        </>
    );
}
