/**
 * Risk-questionnaire status presentation: the one status → tone + label map
 * (audit 2026-09-30 PG-20 / PG-03, §4.4 A). Every surface renders it through
 * `components/risks/QuestionnaireStatusBadge` (risk tab, history table,
 * questionnaire dialog, approvals inbox), so "submitted" reads the same
 * everywhere and no raw status code reaches the screen. Tones are status tones
 * from `lib/tones.ts`.
 */
import type { StatusTone } from '@/lib/tones';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

export type QuestionnaireDisplayStatus = 'overdue' | 'sent' | 'in_progress' | 'submitted';

const QUESTIONNAIRE_STATUS_TONE: Readonly<Record<QuestionnaireDisplayStatus, StatusTone>> = {
    overdue: 'danger',
    sent: 'warning',
    in_progress: 'info',
    submitted: 'success',
};

/** Label for a stored status the client does not know (never the raw code, PG-03). */
const UNKNOWN_STATUS_LABEL_KEY = 'risks:questionnaire.status.unknown';

type QuestionnaireStatusInput = Pick<RiskQuestionnaireListItem, 'status' | 'due_at'>;

export function isQuestionnaireOverdue(questionnaire: QuestionnaireStatusInput, now = Date.now()): boolean {
    return questionnaire.status !== 'submitted' && new Date(questionnaire.due_at).getTime() < now;
}

export interface QuestionnaireStatusMeta {
    /** Display status (overdue wins over the stored status); `null` for an unknown stored status. */
    status: QuestionnaireDisplayStatus | null;
    /** `risks:questionnaire.status.*` key; `…status.unknown` for an unknown stored status. */
    labelKey: string;
    tone: StatusTone;
}

function toDisplayStatus(status: string): QuestionnaireDisplayStatus | null {
    return status === 'sent' || status === 'in_progress' || status === 'submitted' ? status : null;
}

export function getQuestionnaireStatusMeta(
    questionnaire: QuestionnaireStatusInput,
    now = Date.now(),
): QuestionnaireStatusMeta {
    const status = isQuestionnaireOverdue(questionnaire, now) ? 'overdue' : toDisplayStatus(questionnaire.status);
    return {
        status,
        labelKey: status ? `risks:questionnaire.status.${status}` : UNKNOWN_STATUS_LABEL_KEY,
        tone: status ? QUESTIONNAIRE_STATUS_TONE[status] : 'neutral',
    };
}
