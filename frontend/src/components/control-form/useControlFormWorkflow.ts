import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseUpdateResult } from '@/lib/approvalUi';
import { controlApi } from '@/services/controlApi';
import { logError } from '@/services/logger';
import type { UserLookupItem } from '@/services/lookupApi';
import type { Control, ControlCreate, ControlUpdate } from '@/types/control';
import { ControlForm as ControlFormType, ControlFrequency, ControlStatus } from '@/types/control';
import type { ControlEffectiveness } from '@/types/risk';

import { getOwnerAutoDepartmentId } from './controlFormFilters';
import { getControlFormSubmissionError, getControlFormStepError } from './controlFormValidation';
import { getControlFormErrorKey } from './controlFormUtils';

interface SubmitLinkState {
    selectedRiskId: number | undefined;
    riskEffectiveness: ControlEffectiveness;
    linkNotes: string;
}

interface UseControlFormWorkflowArgs {
    initialData?: Control;
    isEdit: boolean;
    onSuccess?: (controlId: number) => void | Promise<void>;
    users: UserLookupItem[];
    t: (key: string, options?: Record<string, unknown>) => string;
}

interface ControlFlashState {
    tone: 'warn';
    message: string;
}

export function useControlFormWorkflow({ initialData, isEdit, onSuccess, users, t }: UseControlFormWorkflowArgs) {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [approvalQueued, setApprovalQueued] = useState<{ message: string } | null>(null);
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

    const submit = async ({ selectedRiskId, riskEffectiveness, linkNotes }: SubmitLinkState) => {
        const submissionError = getControlFormSubmissionError(formData, t);
        if (submissionError) {
            setError(submissionError);
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);
            setApprovalQueued(null);

            let controlId = initialData?.id;

            if (isEdit && initialData) {
                const result = await controlApi.updateControl(initialData.id, formData as ControlUpdate);
                const parsed = parseUpdateResult(result);
                if (parsed.kind === 'approval') {
                    setApprovalQueued({ message: parsed.message });
                    setIsSubmitting(false);
                    return;
                }
            } else {
                const newControl = await controlApi.createControl(formData as ControlCreate);
                controlId = newControl.id;
            }

            let controlFlash: ControlFlashState | null = null;
            if (controlId && selectedRiskId) {
                try {
                    await controlApi.linkRisk(controlId, {
                        risk_id: selectedRiskId,
                        effectiveness: riskEffectiveness,
                        notes: linkNotes,
                    });
                } catch (linkErr) {
                    logError('Control created but failed to link risk:', linkErr);
                    controlFlash = {
                        tone: 'warn',
                        message: 'Control created, but linking the selected risk failed.',
                    };
                }
            }

            if (onSuccess && controlId) {
                await onSuccess(controlId);
            } else if (controlId) {
                void navigate(`/controls/${controlId}`, controlFlash ? { state: { controlFlash } } : undefined);
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
    };
}
