import { apiClient } from './apiClient';
import type {
    RiskQuestionnaireListItem,
    RiskQuestionnaireDetail,
    RiskQuestionnaireDraftUpdate,
    RiskQuestionnaireSubmit,
    RiskQuestionnaireClarification,
    RiskQuestionnaireClarificationCreate,
    RiskQuestionnaireClarificationRespond,
} from '@/types/riskQuestionnaire';

export const riskQuestionnairesApi = {
    inbox: () =>
        apiClient.get<RiskQuestionnaireListItem[]>(`/questionnaires/inbox`),

    listForRisk: (riskId: number) =>
        apiClient.get<RiskQuestionnaireListItem[]>(`/risks/${riskId}/questionnaires`),

    sendForRisk: (riskId: number) =>
        apiClient.post<RiskQuestionnaireDetail>(`/risks/${riskId}/questionnaires/send`, {}),

    get: (questionnaireId: number, options: { includePrevious?: boolean } = {}) =>
        apiClient.get<RiskQuestionnaireDetail>(`/questionnaires/${questionnaireId}`, {
            params: options.includePrevious ? { include_previous: true } : undefined,
        }),

    open: (questionnaireId: number, options: { includePrevious?: boolean } = {}) =>
        apiClient.post<RiskQuestionnaireDetail>(
            `/questionnaires/${questionnaireId}/open`,
            {},
            { params: options.includePrevious ? { include_previous: true } : undefined }
        ),

    saveDraft: (questionnaireId: number, answers: Record<string, unknown>) =>
        apiClient.patch<RiskQuestionnaireDetail>(`/questionnaires/${questionnaireId}/draft`, {
            answers,
        } satisfies RiskQuestionnaireDraftUpdate),

    submit: (questionnaireId: number, answers: Record<string, unknown>) =>
        apiClient.post<RiskQuestionnaireDetail>(`/questionnaires/${questionnaireId}/submit`, {
            answers,
        } satisfies RiskQuestionnaireSubmit),

    listClarifications: (questionnaireId: number) =>
        apiClient.get<RiskQuestionnaireClarification[]>(`/questionnaires/${questionnaireId}/clarifications`),

    createClarification: (questionnaireId: number, payload: RiskQuestionnaireClarificationCreate) =>
        apiClient.post<RiskQuestionnaireClarification>(`/questionnaires/${questionnaireId}/clarifications`, payload),

    respondClarification: (questionnaireId: number, clarificationId: number, payload: RiskQuestionnaireClarificationRespond) =>
        apiClient.post<RiskQuestionnaireClarification>(
            `/questionnaires/${questionnaireId}/clarifications/${clarificationId}/respond`,
            payload
        ),
};
