import { useEffect, useMemo, useState } from 'react';

import { apiClient } from '@/services/apiClient';
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

    const templateVersion = questionnaire?.template_version ?? 'v1';
    const template = useMemo(() => getRiskOwnerReassessmentTemplate(templateVersion), [templateVersion]);
    const templateQuestionKeys = useMemo(
        () => new Set(template.flatMap((section) => section.questions).map((question) => question.key)),
        [template],
    );

    const isOverdue = useMemo(() => {
        if (!questionnaire) return false;
        if (questionnaire.status === 'submitted') return false;
        return new Date(questionnaire.due_at).getTime() < Date.now();
    }, [questionnaire]);

    const capabilities = questionnaire?.capabilities ?? null;
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
        let cancelled = false;

        const load = async () => {
            if (!isOpen || !questionnaireId) return;
            setErrorKey(null);
            setMissingKeys([]);
            setLoading(true);
            try {
                let data = await riskQuestionnairesApi.get(questionnaireId, { includePrevious: DEFAULT_COMPARE_MODE });
                const transition = resolveQuestionnaireDetailTransition({
                    kind: 'read',
                    shouldAutoOpen: shouldAutoOpenQuestionnaire(data),
                });
                if (transition.shouldOpen) {
                    try {
                        data = await riskQuestionnairesApi.open(questionnaireId, { includePrevious: DEFAULT_COMPARE_MODE });
                    } catch {
                        // best-effort: keep the read-only view if open fails
                    }
                }
                if (cancelled) return;
                setQuestionnaire(data);
                setAnswers((data.answers ?? {}) as Record<string, unknown>);
                setCompareMode(DEFAULT_COMPARE_MODE);
            } catch (error) {
                if (cancelled) return;
                setErrorKey(apiClient.toUiMessageKey(error));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [isOpen, questionnaireId]);

    useEffect(() => {
        let cancelled = false;
        const loadPreviousIfNeeded = async () => {
            if (!isOpen || !questionnaireId) return;
            if (!compareMode) return;
            if (questionnaire?.previous_submission !== undefined) return;
            try {
                const data = await riskQuestionnairesApi.get(questionnaireId, { includePrevious: true });
                if (cancelled) return;
                setQuestionnaire((current) => (current ? { ...current, previous_submission: data.previous_submission } : data));
            } catch {
                // best-effort
            }
        };
        void loadPreviousIfNeeded();
        return () => {
            cancelled = true;
        };
    }, [compareMode, isOpen, questionnaire?.previous_submission, questionnaireId]);

    useEffect(() => {
        let cancelled = false;
        const loadClarifications = async () => {
            if (!isOpen || !questionnaireId) return;
            setClarificationsLoading(true);
            try {
                const data = await riskQuestionnairesApi.listClarifications(questionnaireId);
                if (cancelled) return;
                setClarifications(data);
            } catch {
                if (cancelled) return;
                setClarifications([]);
            } finally {
                if (!cancelled) setClarificationsLoading(false);
            }
        };
        void loadClarifications();
        return () => {
            cancelled = true;
        };
    }, [isOpen, questionnaireId]);

    const validate = () => {
        const missing = getMissingRequiredKeys(template, answers);
        setMissingKeys(missing);
        return missing.length === 0;
    };

    const refreshQuestionnaire = async (id: number) => {
        const refreshed = await riskQuestionnairesApi.get(id, { includePrevious: compareMode });
        setQuestionnaire(refreshed);
        setAnswers((refreshed.answers ?? {}) as Record<string, unknown>);
    };

    const handleSave = async () => {
        if (!questionnaire) return;
        setSaving(true);
        setErrorKey(null);
        try {
            const updated = await riskQuestionnairesApi.saveDraft(questionnaire.id, answers);
            await refreshQuestionnaire(updated.id);
            onChanged?.();
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = async () => {
        if (!questionnaire) return;
        setErrorKey(null);
        if (!validate()) {
            setErrorKey('risks:questionnaire.validation_missing');
            return;
        }
        setSubmitting(true);
        try {
            const updated = await riskQuestionnairesApi.submit(questionnaire.id, answers);
            await refreshQuestionnaire(updated.id);
            onChanged?.();
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setSubmitting(false);
        }
    };

    const handleRequestClarification = async (sectionKey: string) => {
        if (!questionnaire) return;
        setErrorKey(null);
        try {
            await riskQuestionnairesApi.createClarification(questionnaire.id, {
                section_key: sectionKey,
                request_message: requestMessage.trim(),
                question_keys: requestQuestionKeys.length ? requestQuestionKeys : undefined,
            });
            const data = await riskQuestionnairesApi.listClarifications(questionnaire.id);
            setClarifications(data);
            await refreshQuestionnaire(questionnaire.id);
            setRequestingSectionKey(null);
            setRequestMessage('');
            setRequestQuestionKeys([]);
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        }
    };

    const handleRespondClarification = async (clarificationId: number) => {
        if (!questionnaire) return;
        setErrorKey(null);
        try {
            await riskQuestionnairesApi.respondClarification(questionnaire.id, clarificationId, {
                response_message: responseMessage.trim(),
            });
            const data = await riskQuestionnairesApi.listClarifications(questionnaire.id);
            setClarifications(data);
            await refreshQuestionnaire(questionnaire.id);
            setRespondingClarificationId(null);
            setResponseMessage('');
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        }
    };

    const close = () => {
        setErrorKey(null);
        setMissingKeys([]);
        setRequestingSectionKey(null);
        setRequestMessage('');
        setRequestQuestionKeys([]);
        setRespondingClarificationId(null);
        setResponseMessage('');
        onClose();
    };

    const previousAnswers = (questionnaire?.previous_submission?.answers ?? {}) as Record<string, unknown>;
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
            hasPreviousCycle: questionnaire?.previous_submission !== null || comparisonModel.hasPreviousSubmission,
            comparisonModel,
            previousCycleLoaded: questionnaire?.previous_submission !== undefined,
            setCompareMode,
        },
        errorKey,
        handleSave,
        handleSubmit,
        isOverdue,
        loading,
        questionnaire,
        saving,
        submitting,
        template,
    };
}
