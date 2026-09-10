import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiClientError, apiClient, isForbiddenApiError } from '@/services/apiClient';
import { isAbortError } from '@/services/api/requestRuntime';
import { riskQuestionnairesApi } from '@/services/riskQuestionnairesApi';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { Risk } from '@/types/risk';
import type { RiskQuestionnaireClarification, RiskQuestionnaireDetail } from '@/types/riskQuestionnaire';

import { getRiskOwnerReassessmentTemplate } from '../riskQuestionnaireQuestions';
import {
    getMissingRequiredKeys,
    groupClarificationsBySection,
    isChangedAnswer,
} from './questionnairePresentation';
import {
    buildQuestionnaireComparisonModel,
    resolveQuestionnaireDetailTransition,
} from './questionnaireDetailWorkflow';
import { shouldAutoOpenQuestionnaire } from './questionnaireWorkflowState';

const DEFAULT_COMPARE_MODE = false;
type QuestionnaireAction = 'save' | 'submit' | 'request-clarification' | 'respond-clarification';

function isProtectedUnavailableError(error: unknown): boolean {
    return isForbiddenApiError(error) || error instanceof ApiClientError && error.status === 404;
}

interface UseRiskQuestionnaireDetailWorkflowParams {
    isOpen: boolean;
    onChanged?: () => void;
    onClose: () => void;
    questionnaireId: number | null;
    risk: Risk;
}

export function useRiskQuestionnaireDetailWorkflow({
    isOpen,
    onChanged,
    onClose,
    questionnaireId,
}: UseRiskQuestionnaireDetailWorkflowParams) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [questionnaire, setQuestionnaire] = useState<RiskQuestionnaireDetail | null>(null);
    const [answers, setAnswers] = useState<Record<string, unknown>>({});
    const [missingKeys, setMissingKeys] = useState<string[]>([]);
    const [compareMode, setCompareMode] = useState(false);
    const [clarifications, setClarifications] = useState<RiskQuestionnaireClarification[]>([]);
    const [clarificationsLoading, setClarificationsLoading] = useState(false);
    const [requestingSectionKey, setRequestingSectionKey] = useState<string | null>(null);
    const [requestMessage, setRequestMessage] = useState('');
    const [requestQuestionKeys, setRequestQuestionKeys] = useState<string[]>([]);
    const [respondingClarificationId, setRespondingClarificationId] = useState<number | null>(null);
    const [responseMessage, setResponseMessage] = useState('');
    const questionnaireOwnerRef = useRef<number | null>(questionnaireId);
    const actionControllerRef = useRef<AbortController | null>(null);
    const activeActionRef = useRef<QuestionnaireAction | null>(null);
    questionnaireOwnerRef.current = isOpen ? questionnaireId : null;

    const resetOwnedState = useCallback(() => {
        setLoading(false);
        setSaving(false);
        setSubmitting(false);
        setErrorKey(null);
        setQuestionnaire(null);
        setAnswers({});
        setMissingKeys([]);
        setCompareMode(DEFAULT_COMPARE_MODE);
        setClarifications([]);
        setClarificationsLoading(false);
        setRequestingSectionKey(null);
        setRequestMessage('');
        setRequestQuestionKeys([]);
        setRespondingClarificationId(null);
        setResponseMessage('');
        activeActionRef.current = null;
    }, []);

    useEffect(() => () => {
        questionnaireOwnerRef.current = null;
        actionControllerRef.current?.abort();
        activeActionRef.current = null;
    }, []);

    useEffect(() => {
        actionControllerRef.current?.abort();
        actionControllerRef.current = null;
        resetOwnedState();
        return () => actionControllerRef.current?.abort();
    }, [isOpen, questionnaireId, resetOwnedState]);

    const ownedQuestionnaire = isOpen
        && questionnaireId !== null
        && questionnaire?.id === questionnaireId
        ? questionnaire
        : null;
    const templateVersion = ownedQuestionnaire?.template_version ?? 'v1';
    const template = useMemo(() => getRiskOwnerReassessmentTemplate(templateVersion), [templateVersion]);
    const templateQuestionKeys = useMemo(
        () => new Set(template.flatMap((section) => section.questions).map((question) => question.key)),
        [template],
    );

    const isOverdue = useMemo(() => {
        if (!ownedQuestionnaire) return false;
        if (ownedQuestionnaire.status === 'submitted') return false;
        return new Date(ownedQuestionnaire.due_at).getTime() < Date.now();
    }, [ownedQuestionnaire]);

    const capabilities = ownedQuestionnaire?.capabilities ?? null;
    const canSaveDraft = resolveCapabilityFlag(
        capabilities,
        'can_save_draft',
    );
    const canSubmitQuestionnaire = resolveCapabilityFlag(
        capabilities,
        'can_submit',
    );
    const isEditable = canSaveDraft || canSubmitQuestionnaire;
    const canRequestClarification = resolveCapabilityFlag(
        capabilities,
        'can_request_clarification',
    );
    const isRiskOwner = resolveCapabilityFlag(
        capabilities,
        'can_respond_to_clarifications',
    );

    useEffect(() => {
        const controller = new AbortController();

        const load = async () => {
            if (!isOpen || !questionnaireId) return;
            setErrorKey(null);
            setMissingKeys([]);
            setLoading(true);
            try {
                let data = await riskQuestionnairesApi.get(
                    questionnaireId,
                    { includePrevious: DEFAULT_COMPARE_MODE },
                    { signal: controller.signal },
                );
                const transition = resolveQuestionnaireDetailTransition({
                    kind: 'read',
                    shouldAutoOpen: shouldAutoOpenQuestionnaire(data),
                });
                if (transition.shouldOpen) {
                    try {
                        data = await riskQuestionnairesApi.open(
                            questionnaireId,
                            { includePrevious: DEFAULT_COMPARE_MODE },
                            { signal: controller.signal },
                        );
                    } catch (error) {
                        if (isProtectedUnavailableError(error)) throw error;
                        // best-effort: keep the read-only view if open fails
                    }
                }
                if (controller.signal.aborted || questionnaireOwnerRef.current !== questionnaireId) return;
                setQuestionnaire(data);
                setAnswers((data.answers ?? {}) as Record<string, unknown>);
                setCompareMode(DEFAULT_COMPARE_MODE);
            } catch (error) {
                if (isAbortError(error) || controller.signal.aborted || questionnaireOwnerRef.current !== questionnaireId) return;
                if (isProtectedUnavailableError(error)) {
                    resetOwnedState();
                }
                setErrorKey(apiClient.toUiMessageKey(error));
            } finally {
                if (!controller.signal.aborted && questionnaireOwnerRef.current === questionnaireId) setLoading(false);
            }
        };

        void load();
        return () => {
            controller.abort();
        };
    }, [isOpen, questionnaireId, resetOwnedState]);

    useEffect(() => {
        const controller = new AbortController();
        const loadPreviousIfNeeded = async () => {
            if (!isOpen || !questionnaireId) return;
            if (!compareMode) return;
            if (ownedQuestionnaire?.previous_submission !== undefined) return;
            try {
                const data = await riskQuestionnairesApi.get(
                    questionnaireId,
                    { includePrevious: true },
                    { signal: controller.signal },
                );
                if (controller.signal.aborted || questionnaireOwnerRef.current !== questionnaireId) return;
                setQuestionnaire((current) => (current ? { ...current, previous_submission: data.previous_submission } : data));
            } catch {
                // best-effort
            }
        };
        void loadPreviousIfNeeded();
        return () => {
            controller.abort();
        };
    }, [compareMode, isOpen, ownedQuestionnaire?.previous_submission, questionnaireId]);

    useEffect(() => {
        const controller = new AbortController();
        const loadClarifications = async () => {
            if (!isOpen || !questionnaireId) return;
            setClarificationsLoading(true);
            try {
                const data = await riskQuestionnairesApi.listClarifications(questionnaireId, { signal: controller.signal });
                if (controller.signal.aborted || questionnaireOwnerRef.current !== questionnaireId) return;
                setClarifications(data);
            } catch {
                if (controller.signal.aborted || questionnaireOwnerRef.current !== questionnaireId) return;
                setClarifications([]);
            } finally {
                if (!controller.signal.aborted && questionnaireOwnerRef.current === questionnaireId) setClarificationsLoading(false);
            }
        };
        void loadClarifications();
        return () => {
            controller.abort();
        };
    }, [isOpen, questionnaireId]);

    const validate = () => {
        const missing = getMissingRequiredKeys(template, answers);
        setMissingKeys(missing);
        return missing.length === 0;
    };

    const isCurrentAction = (controller: AbortController, ownerId: number) => (
        !controller.signal.aborted
        && actionControllerRef.current === controller
        && questionnaireOwnerRef.current === ownerId
    );

    const clearSupersededActionState = () => {
        if (activeActionRef.current === 'save') setSaving(false);
        if (activeActionRef.current === 'submit') setSubmitting(false);
        if (activeActionRef.current === 'request-clarification') setRequestingSectionKey(null);
        if (activeActionRef.current === 'respond-clarification') setRespondingClarificationId(null);
    };

    const beginAction = (action: QuestionnaireAction) => {
        actionControllerRef.current?.abort();
        clearSupersededActionState();
        const controller = new AbortController();
        actionControllerRef.current = controller;
        activeActionRef.current = action;
        return controller;
    };

    const applyActionFailure = (error: unknown) => {
        if (isProtectedUnavailableError(error)) {
            resetOwnedState();
        }
        setErrorKey(apiClient.toUiMessageKey(error));
    };

    const refreshQuestionnaire = async (id: number, signal: AbortSignal) => {
        const refreshed = await riskQuestionnairesApi.get(
            id,
            { includePrevious: compareMode },
            { signal },
        );
        if (signal.aborted || questionnaireOwnerRef.current !== id) return;
        setQuestionnaire(refreshed);
        setAnswers((refreshed.answers ?? {}) as Record<string, unknown>);
    };

    const handleSave = async () => {
        if (!ownedQuestionnaire) return;
        const ownerId = ownedQuestionnaire.id;
        const controller = beginAction('save');
        setSaving(true);
        setErrorKey(null);
        try {
            const updated = await riskQuestionnairesApi.saveDraft(
                ownerId,
                answers,
                { signal: controller.signal },
            );
            if (!isCurrentAction(controller, ownerId)) return;
            await refreshQuestionnaire(updated.id, controller.signal);
            if (!isCurrentAction(controller, ownerId)) return;
            onChanged?.();
        } catch (error) {
            if (isAbortError(error) || !isCurrentAction(controller, ownerId)) return;
            applyActionFailure(error);
        } finally {
            if (isCurrentAction(controller, ownerId)) {
                actionControllerRef.current = null;
                activeActionRef.current = null;
                setSaving(false);
            }
        }
    };

    const handleSubmit = async () => {
        if (!ownedQuestionnaire) return;
        const ownerId = ownedQuestionnaire.id;
        setErrorKey(null);
        if (!validate()) {
            setErrorKey('risks:questionnaire.validation_missing');
            return;
        }
        const controller = beginAction('submit');
        setSubmitting(true);
        try {
            const updated = await riskQuestionnairesApi.submit(
                ownerId,
                answers,
                { signal: controller.signal },
            );
            if (!isCurrentAction(controller, ownerId)) return;
            await refreshQuestionnaire(updated.id, controller.signal);
            if (!isCurrentAction(controller, ownerId)) return;
            onChanged?.();
        } catch (error) {
            if (isAbortError(error) || !isCurrentAction(controller, ownerId)) return;
            applyActionFailure(error);
        } finally {
            if (isCurrentAction(controller, ownerId)) {
                actionControllerRef.current = null;
                activeActionRef.current = null;
                setSubmitting(false);
            }
        }
    };

    const handleRequestClarification = async (sectionKey: string) => {
        if (!ownedQuestionnaire) return;
        const ownerId = ownedQuestionnaire.id;
        const controller = beginAction('request-clarification');
        setErrorKey(null);
        try {
            await riskQuestionnairesApi.createClarification(ownerId, {
                section_key: sectionKey,
                request_message: requestMessage.trim(),
                question_keys: requestQuestionKeys.length ? requestQuestionKeys : undefined,
            }, { signal: controller.signal });
            if (!isCurrentAction(controller, ownerId)) return;
            const data = await riskQuestionnairesApi.listClarifications(ownerId, { signal: controller.signal });
            if (!isCurrentAction(controller, ownerId)) return;
            setClarifications(data);
            await refreshQuestionnaire(ownerId, controller.signal);
            if (!isCurrentAction(controller, ownerId)) return;
            setRequestingSectionKey(null);
            setRequestMessage('');
            setRequestQuestionKeys([]);
        } catch (error) {
            if (isAbortError(error) || !isCurrentAction(controller, ownerId)) return;
            applyActionFailure(error);
        } finally {
            if (isCurrentAction(controller, ownerId)) {
                actionControllerRef.current = null;
                activeActionRef.current = null;
            }
        }
    };

    const handleRespondClarification = async (clarificationId: number) => {
        if (!ownedQuestionnaire) return;
        const ownerId = ownedQuestionnaire.id;
        const controller = beginAction('respond-clarification');
        setErrorKey(null);
        try {
            await riskQuestionnairesApi.respondClarification(ownerId, clarificationId, {
                response_message: responseMessage.trim(),
            }, { signal: controller.signal });
            if (!isCurrentAction(controller, ownerId)) return;
            const data = await riskQuestionnairesApi.listClarifications(ownerId, { signal: controller.signal });
            if (!isCurrentAction(controller, ownerId)) return;
            setClarifications(data);
            await refreshQuestionnaire(ownerId, controller.signal);
            if (!isCurrentAction(controller, ownerId)) return;
            setRespondingClarificationId(null);
            setResponseMessage('');
        } catch (error) {
            if (isAbortError(error) || !isCurrentAction(controller, ownerId)) return;
            applyActionFailure(error);
        } finally {
            if (isCurrentAction(controller, ownerId)) {
                actionControllerRef.current = null;
                activeActionRef.current = null;
            }
        }
    };

    const close = () => {
        actionControllerRef.current?.abort();
        actionControllerRef.current = null;
        activeActionRef.current = null;
        resetOwnedState();
        onClose();
    };

    const previousAnswers = (ownedQuestionnaire?.previous_submission?.answers ?? {}) as Record<string, unknown>;
    const comparisonModel = buildQuestionnaireComparisonModel({
        currentAnswerCount: Object.keys(answers).length,
        previousAnswerCount: Object.keys(previousAnswers).length,
    });
    const getPreviousAnswer = (key: string): unknown => previousAnswers[key];
    const isChanged = (key: string): boolean => isChangedAnswer({
        key,
        compareMode,
        templateQuestionKeys,
        currentAnswers: answers,
        previousAnswers,
    });

    return {
        answerState: {
            answers,
            getPreviousAnswer,
            isChanged,
            isEditable,
            missingKeys,
            setAnswers,
        },
        capabilities: {
            canRequestClarification,
            canSaveDraft,
            canSubmitQuestionnaire,
            isEditable,
            isRiskOwner,
        },
        clarificationState: {
            clarificationsLoading,
            handleRequestClarification,
            handleRespondClarification,
            requestMessage,
            requestQuestionKeys,
            requestingSectionKey,
            respondingClarificationId,
            responseMessage,
            sectionClarifications: groupClarificationsBySection(clarifications),
            setRequestMessage,
            setRequestQuestionKeys,
            setRequestingSectionKey,
            setRespondingClarificationId,
            setResponseMessage,
        },
        close,
        compareState: {
            compareMode,
            hasPreviousCycle: ownedQuestionnaire?.previous_submission !== null || comparisonModel.hasPreviousSubmission,
            comparisonModel,
            previousCycleLoaded: ownedQuestionnaire?.previous_submission !== undefined,
            setCompareMode,
        },
        errorKey,
        handleSave,
        handleSubmit,
        isOverdue,
        loading,
        questionnaire: ownedQuestionnaire,
        saving,
        submitting,
        template,
    };
}
