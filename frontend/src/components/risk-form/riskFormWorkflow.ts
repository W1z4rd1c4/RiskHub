import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import { parseUpdateResult } from '@/lib/approvalUi';
import { riskScoreVariantClass } from '@/lib/riskScoreTheme';
import { ApiClientError } from '@/services/apiClient';
import { riskApi } from '@/services/riskApi';
import { riskHubApi } from '@/services/riskHubApi';
import { logError } from '@/services/logger';
import type { UserLookupItem } from '@/services/lookupApi';
import type { Risk, RiskCreate, RiskUpdate } from '@/types/risk';
import { RiskStatus } from '@/types/risk';

import { resolveRiskTypeCode } from './riskTypeDefaults';

interface RiskTypeOption {
    code: string;
}

interface UseRiskFormWorkflowArgs {
    initialData?: Risk;
    isEdit: boolean;
    onSuccess?: (riskId: number) => void | Promise<void>;
    riskTypes: RiskTypeOption[];
    users: UserLookupItem[];
}

export function createInitialRiskFormData(risk?: Risk): Partial<Risk> {
    return {
        name: '',
        process: '',
        subprocess: '',
        risk_type: risk?.risk_type,
        category: '',
        description: '',
        status: RiskStatus.ACTIVE,
        is_priority: false,
        gross_probability: 3,
        gross_impact: 3,
        net_probability: 2,
        net_impact: 2,
        kri_indicator: '',
        kri_threshold_green: '',
        kri_threshold_yellow: '',
        kri_threshold_red: '',
        ...risk,
    };
}

export function filterRiskOwners(
    users: UserLookupItem[],
    search: string,
    roleFilter: string,
    departmentId: number | null | undefined,
): UserLookupItem[] {
    const normalizedSearch = search.toLowerCase();
    return users.filter((user) => {
        const matchesSearch = !search
            || user.name?.toLowerCase().includes(normalizedSearch)
            || user.email?.toLowerCase().includes(normalizedSearch);
        const matchesRole = !roleFilter || user.role_name === roleFilter;
        const matchesDepartment = !departmentId || user.department_id === departmentId;
        return matchesSearch && matchesRole && matchesDepartment;
    });
}

export function getUniqueRiskOwnerRoles(users: UserLookupItem[]): string[] {
    return [...new Set(users.map((user) => user.role_name).filter((role): role is string => Boolean(role)))];
}

export function validateRiskIdentity(formData: Partial<Risk>): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!formData.name?.trim()) errors.name = 'Risk Name is required';
    if (!formData.process?.trim()) errors.process = 'Main Process is required';
    if (!formData.category?.trim()) errors.category = 'Category is required';
    if (!formData.description?.trim()) errors.description = 'Risk Description is required';
    return errors;
}

export function validateRiskOwnership(formData: Partial<Risk>): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!formData.department_id) errors.department_id = 'Department is required';
    if (!formData.owner_id) errors.owner_id = 'Risk Owner is required';
    return errors;
}

export function useRiskScorePresentation() {
    const { thresholds } = useRiskThresholds();

    const getScoreTextColor = (score: number) => {
        return riskScoreVariantClass('text', score, thresholds);
    };

    const getSliderAccent = (score: number) => {
        return riskScoreVariantClass('slider', score, thresholds);
    };

    return { getScoreTextColor, getSliderAccent };
}

export function useRiskFormWorkflow({ initialData, isEdit, onSuccess, riskTypes, users }: UseRiskFormWorkflowArgs) {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [approvalQueued, setApprovalQueued] = useState<{ message: string } | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [formData, setFormData] = useState<Partial<Risk>>(() => createInitialRiskFormData(initialData));

    useEffect(() => {
        setFormData(createInitialRiskFormData(initialData));
        setFieldErrors({});
        setError(null);
        setApprovalQueued(null);
    }, [initialData]);

    useEffect(() => {
        const resolvedRiskType = resolveRiskTypeCode(formData.risk_type, riskTypes);
        if (formData.risk_type === resolvedRiskType) return;

        setFormData((prev) => {
            if (prev.risk_type === resolvedRiskType) return prev;
            return { ...prev, risk_type: resolvedRiskType };
        });
    }, [formData.risk_type, riskTypes]);

    const handleInputChange = (field: keyof Risk, value: unknown) => {
        setFormData((prev) => {
            const nextData = { ...prev, [field]: value };

            if (field === 'owner_id' && value) {
                const selectedUser = users.find((user) => user.id === value);
                if (selectedUser?.department_id) {
                    nextData.department_id = selectedUser.department_id;
                }
            }

            return nextData;
        });

        setFieldErrors((prev) => {
            const nextErrors = { ...prev };
            if (prev[field]) {
                nextErrors[field] = '';
            }
            if (field === 'owner_id' && prev.department_id) {
                nextErrors.department_id = '';
            }
            return nextErrors;
        });
    };

    const validateStep1 = (): boolean => {
        const errors = validateRiskIdentity(formData);
        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const validateStep2 = (): boolean => {
        const errors = validateRiskOwnership(formData);
        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const submit = async () => {
        if (!validateStep1()) {
            setCurrentStep(0);
            return;
        }
        if (!validateStep2()) {
            setCurrentStep(1);
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);
            setApprovalQueued(null);

            if (isEdit && initialData) {
                const result = await riskApi.updateRisk(initialData.id, formData as RiskUpdate);
                const parsed = parseUpdateResult(result);
                if (parsed.kind === 'approval') {
                    setApprovalQueued({ message: parsed.message });
                    setIsSubmitting(false);
                    return;
                }
            } else {
                const riskTypeOptions = await riskHubApi.getPublicRiskTypes().catch(() => riskTypes);
                const resolvedRiskType = resolveRiskTypeCode(formData.risk_type, riskTypeOptions);
                const createPayload = { ...formData, risk_type: resolvedRiskType } as RiskCreate;

                if (formData.risk_type !== resolvedRiskType) {
                    setFormData((prev) => ({ ...prev, risk_type: resolvedRiskType }));
                }

                const newRisk = await riskApi.createRisk(createPayload);
                if (onSuccess) {
                    await onSuccess(newRisk.id);
                } else {
                    void navigate(`/risks/${newRisk.id}`);
                }
                return;
            }

            void navigate(`/risks/${initialData?.id}`);
        } catch (err: unknown) {
            logError('Error saving risk:', err);
            setError(err instanceof ApiClientError ? err.messageKey : 'errorKeys.save_risk_failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    const nextStep = (event?: React.MouseEvent) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (currentStep === 0 && !validateStep1()) return;
        if (currentStep === 1 && !validateStep2()) return;
        setCurrentStep((prev) => Math.min(prev + 1, 2));
    };

    const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

    return {
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
    };
}
