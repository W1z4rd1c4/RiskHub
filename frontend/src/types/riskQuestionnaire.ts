export type RiskQuestionnaireStatus = 'sent' | 'in_progress' | 'submitted';

export interface RiskQuestionnaireListItem {
    id: number;
    risk_id: number;
    assigned_to_user_id: number;
    sent_by_user_id: number;
    status: RiskQuestionnaireStatus;
    template_key: string;
    template_version: string;
    sent_at: string;
    due_at: string;
    submitted_at?: string | null;
    submitted_by_user_id?: number | null;

    assigned_to_user_name?: string | null;
    sent_by_user_name?: string | null;
    submitted_by_user_name?: string | null;
}

export interface RiskQuestionnaireDetail extends RiskQuestionnaireListItem {
    answers?: Record<string, unknown> | null;
}

export interface RiskQuestionnaireDraftUpdate {
    answers: Record<string, unknown>;
}

export interface RiskQuestionnaireSubmit {
    answers: Record<string, unknown>;
}

