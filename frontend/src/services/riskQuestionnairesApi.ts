import { apiClient } from './apiClient';
import {
    riskQuestionnaireClarificationArraySchema,
    riskQuestionnaireClarificationSchema,
    riskQuestionnaireDetailSchema,
    riskQuestionnaireListItemArraySchema,
} from '@/services/api/schemas';
import type {
    RiskQuestionnaireDraftUpdate,
    RiskQuestionnaireSubmit,
    RiskQuestionnaireClarificationCreate,
    RiskQuestionnaireClarificationRespond,
} from '@/types/riskQuestionnaire';

export const riskQuestionnairesApi = {
    inbox: () =>
        apiClient.get(`/questionnaires/inbox`, { schema: riskQuestionnaireListItemArraySchema }),

    listForRisk: (riskId: number, options?: { signal?: AbortSignal }) =>
        apiClient.get(`/risks/${riskId}/questionnaires`, {
            ...options,
            schema: riskQuestionnaireListItemArraySchema,
        }),

    sendForRisk: (riskId: number, options?: { signal?: AbortSignal }) =>
        apiClient.post(`/risks/${riskId}/questionnaires/send`, {}, {
            ...options,
            schema: riskQuestionnaireDetailSchema,
        }),

    get: (
        questionnaireId: number,
        options: { includePrevious?: boolean } = {},
        requestOptions?: { signal?: AbortSignal },
    ) =>
        apiClient.get(`/questionnaires/${questionnaireId}`, {
            ...requestOptions,
            params: options.includePrevious ? { include_previous: true } : undefined,
            schema: riskQuestionnaireDetailSchema,
        }),

    open: (
        questionnaireId: number,
        options: { includePrevious?: boolean } = {},
        requestOptions?: { signal?: AbortSignal },
    ) =>
        apiClient.post(
            `/questionnaires/${questionnaireId}/open`,
            {},
            {
                ...requestOptions,
                params: options.includePrevious ? { include_previous: true } : undefined,
                schema: riskQuestionnaireDetailSchema,
            },
        ),

    saveDraft: (
        questionnaireId: number,
        answers: Record<string, unknown>,
        options?: { signal?: AbortSignal },
    ) =>
        apiClient.patch(`/questionnaires/${questionnaireId}/draft`, {
            answers,
        } satisfies RiskQuestionnaireDraftUpdate, {
            ...options,
            schema: riskQuestionnaireDetailSchema,
        }),

    submit: (
        questionnaireId: number,
        answers: Record<string, unknown>,
        options?: { signal?: AbortSignal },
    ) =>
        apiClient.post(`/questionnaires/${questionnaireId}/submit`, {
            answers,
        } satisfies RiskQuestionnaireSubmit, {
            ...options,
            schema: riskQuestionnaireDetailSchema,
        }),

    listClarifications: (questionnaireId: number, options?: { signal?: AbortSignal }) =>
        apiClient.get(`/questionnaires/${questionnaireId}/clarifications`, {
            ...options,
            schema: riskQuestionnaireClarificationArraySchema,
        }),

    createClarification: (
        questionnaireId: number,
        payload: RiskQuestionnaireClarificationCreate,
        options?: { signal?: AbortSignal },
    ) =>
        apiClient.post(`/questionnaires/${questionnaireId}/clarifications`, payload, {
            ...options,
            schema: riskQuestionnaireClarificationSchema,
        }),

    respondClarification: (
        questionnaireId: number,
        clarificationId: number,
        payload: RiskQuestionnaireClarificationRespond,
        options?: { signal?: AbortSignal },
    ) =>
        apiClient.post(
            `/questionnaires/${questionnaireId}/clarifications/${clarificationId}/respond`,
            payload,
            { ...options, schema: riskQuestionnaireClarificationSchema },
        ),
};
