import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { useFeedback } from '@/hooks/useFeedback';
import { parseUpdateResult } from '@/lib/approvalUi';
import { ApiClientError } from '@/services/apiClient';
import { controlApi } from '@/services/controlApi';
import { logError } from '@/services/logger';
import type { SafeTFunction } from '@/i18n/hooks';
import type { UserLookupItem } from '@/services/lookupApi';
import type { Control, ControlCreate, ControlUpdate } from '@/types/control';
import { ControlForm as ControlFormType, ControlFrequency, ControlStatus } from '@/types/control';
import type { ControlEffectiveness } from '@/types/risk';

import { getOwnerAutoDepartmentId } from './controlFormFilters';
import { getControlFormSubmissionError, getControlFormStepError } from './controlFormValidation';

const getControlFormErrorKey = (error: unknown, fallback = 'errorKeys.unknown'): string => {
    if (error instanceof ApiClientError) {
        return error.messageKey;
    }
    return fallback;
};

interface SubmitLinkState {
    acceptCurrentSnapshot: (snapshot?: string) => void;
    selectedRiskId: number | undefined;
    riskEffectiveness: ControlEffectiveness;
    linkNotes: string;
    submittedSnapshot: string;
}

export function createControlFormSnapshot(
    formData: Partial<Control>,
    linkState: Pick<SubmitLinkState, 'selectedRiskId' | 'riskEffectiveness' | 'linkNotes'>,
): string {
    const hasSelectedRisk = linkState.selectedRiskId !== undefined;
    return JSON.stringify([
        formData.name ?? '',
        formData.description ?? '',
        formData.control_form ?? '',
        formData.data_source ?? '',
        formData.methodology_reference ?? '',
        formData.control_owner_id ?? null,
        formData.department_id ?? null,
        formData.process_owner_position ?? '',
        formData.frequency ?? '',
        formData.risk_level ?? null,
        formData.status ?? '',
        linkState.selectedRiskId ?? null,
        hasSelectedRisk ? linkState.riskEffectiveness : null,
        hasSelectedRisk ? linkState.linkNotes : '',
    ]);
}

interface UseControlFormWorkflowArgs {
    initialData?: Control;
    isEdit: boolean;
    onSuccess?: (
        controlId: number,
        acceptNavigation?: () => void,
    ) => void | Promise<void>;
    /** Entity page shown after an approval-routed edit (D12 / PM-2); defaults to the control. */
    approvalReturnTo?: string;
    users: UserLookupItem[];
    t: SafeTFunction;
}

export function useControlFormWorkflow({ initialData, isEdit, onSuccess, approvalReturnTo, users, t }: UseControlFormWorkflowArgs) {
    const navigate = useNavigate();
    const feedback = useFeedback();
    const announceApprovalQueued = useApprovalQueued();
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<Control>>({
        name: '',
        description: '',
        status: ControlStatus.DRAFT,
        control_form: ControlFormType.MANUAL,
        frequency: ControlFrequency.MONTHLY,
        risk_level: 3,
        ...initialData,
    });

    const handleInputChange = (field: keyof Control, value: unknown) => {
        setFormData((prev) => {
            const nextData = { ...prev, [field]: value };

            if (field === 'control_owner_id' && value) {
                const departmentId = getOwnerAutoDepartmentId(users, value);
                if (departmentId) {
                    nextData.department_id = departmentId;
                }
            }

            return nextData;
        });
        setError(null);
    };

    const validateStep = (stepIndex: number) => {
        const nextError = getControlFormStepError(stepIndex, formData, t);
        if (nextError) {
            setError(nextError);
            return false;
        }
        return true;
    };

    const submit = async ({
        acceptCurrentSnapshot,
        selectedRiskId,
        riskEffectiveness,
        linkNotes,
        submittedSnapshot,
    }: SubmitLinkState) => {
        const submissionError = getControlFormSubmissionError(formData, t);
        if (submissionError) {
            setError(submissionError);
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);

            let controlId = initialData?.id;

            if (isEdit && initialData) {
                const result = await controlApi.updateControl(initialData.id, formData as ControlUpdate);
                const parsed = parseUpdateResult(result);
                if (parsed.kind === 'approval') {
                    // D12 / PM-2: back to the control with the pending notice + toast.
                    acceptCurrentSnapshot(submittedSnapshot);
                    setIsSubmitting(false);
                    announceApprovalQueued({
                        approvalId: parsed.approvalId,
                        to: approvalReturnTo ?? `/controls/${initialData.id}`,
                    });
                    return;
                }
            } else {
                const newControl = await controlApi.createControl(formData as ControlCreate);
                controlId = newControl.id;
            }

            if (controlId && selectedRiskId) {
                try {
                    await controlApi.linkRisk(controlId, {
                        risk_id: selectedRiskId,
                        effectiveness: riskEffectiveness,
                        notes: linkNotes,
                    });
                } catch (linkErr) {
                    logError('Control saved but failed to link risk:', linkErr);
                    // D9: the partial outcome is a warning toast raised before navigating.
                    feedback.warning({
                        title: t(isEdit
                            ? 'controls:form.risk_link_failed_after_update'
                            : 'controls:form.risk_link_failed_after_create'),
                    });
                }
            }

            acceptCurrentSnapshot(submittedSnapshot);
            if (onSuccess && controlId) {
                await onSuccess(controlId, () => acceptCurrentSnapshot(submittedSnapshot));
            } else if (controlId) {
                void navigate(`/controls/${controlId}`);
            } else {
                void navigate('/controls');
            }
        } catch (err: unknown) {
            logError('Error saving control:', err);
            setError(getControlFormErrorKey(err, 'errorKeys.save_control_failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        currentStep,
        error,
        formData,
        isSubmitting,
        handleInputChange,
        setCurrentStep,
        setError,
        submit,
        validateStep,
    };
}
