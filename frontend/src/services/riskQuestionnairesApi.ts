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

    listForRisk: (riskId: number) =>
        apiClient.get(`/risks/${riskId}/questionnaires`, {
            schema: riskQuestionnaireListItemArraySchema,
        }),

    sendForRisk: (riskId: number) =>
        apiClient.post(`/risks/${riskId}/questionnaires/send`, {}, {
            schema: riskQuestionnaireDetailSchema,
        }),

    get: (questionnaireId: number, options: { includePrevious?: boolean } = {}) =>
        apiClient.get(`/questionnaires/${questionnaireId}`, {
            params: options.includePrevious ? { include_previous: true } : undefined,
            schema: riskQuestionnaireDetailSchema,
        }),

    open: (questionnaireId: number, options: { includePrevious?: boolean } = {}) =>
        apiClient.post(
            `/questionnaires/${questionnaireId}/open`,
            {},
            {
                params: options.includePrevious ? { include_previous: true } : undefined,
                schema: riskQuestionnaireDetailSchema,
            },
        ),

    saveDraft: (questionnaireId: number, answers: Record<string, unknown>) =>
        apiClient.patch(`/questionnaires/${questionnaireId}/draft`, {
            answers,
        } satisfies RiskQuestionnaireDraftUpdate, {
            schema: riskQuestionnaireDetailSchema,
        }),

    submit: (questionnaireId: number, answers: Record<string, unknown>) =>
        apiClient.post(`/questionnaires/${questionnaireId}/submit`, {
            answers,
        } satisfies RiskQuestionnaireSubmit, {
            schema: riskQuestionnaireDetailSchema,
        }),

    listClarifications: (questionnaireId: number) =>
        apiClient.get(`/questionnaires/${questionnaireId}/clarifications`, {
            schema: riskQuestionnaireClarificationArraySchema,
        }),

    createClarification: (questionnaireId: number, payload: RiskQuestionnaireClarificationCreate) =>
        apiClient.post(`/questionnaires/${questionnaireId}/clarifications`, payload, {
            schema: riskQuestionnaireClarificationSchema,
        }),

    respondClarification: (questionnaireId: number, clarificationId: number, payload: RiskQuestionnaireClarificationRespond) =>
        apiClient.post(
            `/questionnaires/${questionnaireId}/clarifications/${clarificationId}/respond`,
            payload,
            { schema: riskQuestionnaireClarificationSchema },
        ),
};
