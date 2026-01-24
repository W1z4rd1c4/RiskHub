import { apiClient } from './apiClient';
import type {
    RiskQuestionnaireListItem,
    RiskQuestionnaireDetail,
    RiskQuestionnaireDraftUpdate,
    RiskQuestionnaireSubmit,
} from '@/types/riskQuestionnaire';

export const riskQuestionnairesApi = {
    listForRisk: (riskId: number) =>
        apiClient.get<RiskQuestionnaireListItem[]>(`/risks/${riskId}/questionnaires`),

    sendForRisk: (riskId: number) =>
        apiClient.post<RiskQuestionnaireDetail>(`/risks/${riskId}/questionnaires/send`, {}),

    get: (questionnaireId: number) =>
        apiClient.get<RiskQuestionnaireDetail>(`/questionnaires/${questionnaireId}`),

    saveDraft: (questionnaireId: number, answers: Record<string, unknown>) =>
        apiClient.patch<RiskQuestionnaireDetail>(`/questionnaires/${questionnaireId}/draft`, {
            answers,
        } satisfies RiskQuestionnaireDraftUpdate),

    submit: (questionnaireId: number, answers: Record<string, unknown>) =>
        apiClient.post<RiskQuestionnaireDetail>(`/questionnaires/${questionnaireId}/submit`, {
            answers,
        } satisfies RiskQuestionnaireSubmit),
};

