export type RiskQuestionnaireStatus = 'sent' | 'in_progress' | 'submitted';

export interface RiskQuestionnaireCapabilities {
    can_open: boolean;
    can_save_draft: boolean;
    can_submit: boolean;
    can_request_clarification: boolean;
    can_respond_to_clarifications: boolean;
}

export interface RiskQuestionnaireListItem {
    id: number;
    risk_id: number;
    risk_name?: string | null;
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
    capabilities?: RiskQuestionnaireCapabilities | null;
}

export interface RiskQuestionnaireDetail extends RiskQuestionnaireListItem {
    answers?: Record<string, unknown> | null;
    previous_submission?: RiskQuestionnairePreviousSubmission | null;
}

export interface RiskQuestionnairePreviousSubmission {
    id: number;
    submitted_at: string;
    template_version: string;
    answers?: Record<string, unknown> | null;
}

export interface RiskQuestionnaireDraftUpdate {
    answers: Record<string, unknown>;
}

export interface RiskQuestionnaireSubmit {
    answers: Record<string, unknown>;
}

export interface RiskQuestionnaireClarification {
    id: number;
    questionnaire_id: number;
    section_key: string;
    question_keys?: string[] | null;
    request_message: string;
    requested_by_user_id: number;
    requested_by_user_name?: string | null;
    requested_at: string;
    response_message?: string | null;
    responded_by_user_id?: number | null;
    responded_by_user_name?: string | null;
    responded_at?: string | null;
}

export interface RiskQuestionnaireClarificationCreate {
    section_key: string;
    request_message: string;
    question_keys?: string[] | null;
}

export interface RiskQuestionnaireClarificationRespond {
    response_message: string;
}
